// Independently authored macOS bridge. No network, arbitrary scripts, or disk persistence.
#import <AppKit/AppKit.h>
#import <Vision/Vision.h>
#import <CoreAudio/CoreAudio.h>
#import <IOKit/ps/IOPowerSources.h>
#import <IOKit/ps/IOPSKeys.h>
#include <mach/mach.h>
#include <sys/sysctl.h>
#include <sys/mount.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <net/if_dl.h>
#include <stdlib.h>
#include <string.h>

static id emptyValue(id value) { return value ?: NSNull.null; }
static NSDictionary *failure(NSString *message) { return @{ @"error": message }; }

static NSDictionary *metrics(void) {
    NSMutableDictionary *result = NSMutableDictionary.dictionary;
    mach_port_t host = mach_host_self();
    host_cpu_load_info_data_t cpu;
    mach_msg_type_number_t cpuCount = HOST_CPU_LOAD_INFO_COUNT;
    if (host_statistics(host, HOST_CPU_LOAD_INFO, (host_info_t)&cpu, &cpuCount) == KERN_SUCCESS) {
        result[@"cpuTicks"] = @[@(cpu.cpu_ticks[CPU_STATE_USER]), @(cpu.cpu_ticks[CPU_STATE_SYSTEM]), @(cpu.cpu_ticks[CPU_STATE_IDLE]), @(cpu.cpu_ticks[CPU_STATE_NICE])];
    }
    uint64_t capacity = 0;
    size_t capacitySize = sizeof(capacity);
    if (sysctlbyname("hw.memsize", &capacity, &capacitySize, NULL, 0) == 0) result[@"memoryTotal"] = @(capacity);
    vm_statistics64_data_t vm;
    mach_msg_type_number_t vmCount = HOST_VM_INFO64_COUNT;
    vm_size_t pageSize = 0;
    if (host_page_size(host, &pageSize) == KERN_SUCCESS && host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&vm, &vmCount) == KERN_SUCCESS) {
        result[@"memoryUsed"] = @(((uint64_t)vm.active_count + vm.wire_count + vm.compressor_page_count) * pageSize);
        result[@"memoryCompressed"] = @((uint64_t)vm.compressor_page_count * pageSize);
    }
    struct xsw_usage swap;
    size_t swapSize = sizeof(swap);
    if (sysctlbyname("vm.swapusage", &swap, &swapSize, NULL, 0) == 0) result[@"swapUsed"] = @(swap.xsu_used);
    struct statfs disk;
    if (statfs(NSHomeDirectory().fileSystemRepresentation, &disk) == 0) {
        result[@"diskTotal"] = @((uint64_t)disk.f_blocks * disk.f_bsize);
        result[@"diskAvailable"] = @((uint64_t)disk.f_bavail * disk.f_bsize);
    }
    NSMutableArray *interfaces = NSMutableArray.array;
    struct ifaddrs *addresses = NULL;
    if (getifaddrs(&addresses) == 0) {
        for (struct ifaddrs *entry = addresses; entry; entry = entry->ifa_next) {
            if (!entry->ifa_addr || entry->ifa_addr->sa_family != AF_LINK || !entry->ifa_data || !(entry->ifa_flags & IFF_UP) || (entry->ifa_flags & IFF_LOOPBACK)) continue;
            const struct if_data *data = entry->ifa_data;
            [interfaces addObject:@{ @"name": @(entry->ifa_name), @"received": @(data->ifi_ibytes), @"sent": @(data->ifi_obytes) }];
        }
        freeifaddrs(addresses);
    }
    result[@"interfaces"] = interfaces;
    CFTypeRef powerInfo = IOPSCopyPowerSourcesInfo();
    if (powerInfo) {
        CFArrayRef sources = IOPSCopyPowerSourcesList(powerInfo);
        if (sources) {
            for (CFIndex i = 0; i < CFArrayGetCount(sources); ++i) {
                NSDictionary *source = (__bridge NSDictionary *)IOPSGetPowerSourceDescription(powerInfo, CFArrayGetValueAtIndex(sources, i));
                if (![source[(__bridge NSString *)CFSTR(kIOPSTypeKey)] isEqual:(__bridge NSString *)CFSTR(kIOPSInternalBatteryType)]) continue;
                double maximum = [source[(__bridge NSString *)CFSTR(kIOPSMaxCapacityKey)] doubleValue];
                NSNumber *remaining = source[(__bridge NSString *)CFSTR(kIOPSTimeToEmptyKey)];
                result[@"battery"] = @{
                    @"percent": maximum > 0 ? @([source[(__bridge NSString *)CFSTR(kIOPSCurrentCapacityKey)] doubleValue] * 100.0 / maximum) : NSNull.null,
                    @"charging": @([source[(__bridge NSString *)CFSTR(kIOPSIsChargingKey)] boolValue]),
                    @"powerSource": emptyValue(source[(__bridge NSString *)CFSTR(kIOPSPowerSourceStateKey)]),
                    @"minutesRemaining": remaining.doubleValue > 0 ? remaining : NSNull.null
                };
                break;
            }
            CFRelease(sources);
        }
        CFRelease(powerInfo);
    }
    mach_port_deallocate(mach_task_self(), host);
    result[@"uptimeSeconds"] = @(NSProcessInfo.processInfo.systemUptime);
    return result;
}

static NSDictionary *clipboardSnapshot(NSDictionary *request) {
    NSPasteboard *board = NSPasteboard.generalPasteboard;
    NSInteger count = board.changeCount;
    // The unchanged clipboard and the initial baseline are never read as content.
    if ([request[@"baselineOnly"] boolValue] || [request[@"lastChange"] longLongValue] == count) return @{ @"changeCount": @(count) };
    NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
    NSString *bundle = front.bundleIdentifier ?: @"";
    NSArray *excluded = request[@"excludedApps"];
    for (NSString *identifier in excluded) {
        if ([identifier caseInsensitiveCompare:bundle] == NSOrderedSame) return @{ @"changeCount": @(count) };
    }
    // Fail closed if the foreground identity is unavailable. Apps may also mark
    // data concealed, transient, or auto-generated to prevent history capture.
    if (!bundle.length) return @{ @"changeCount": @(count) };
    for (NSPasteboardType type in board.types) {
        NSString *lower = type.lowercaseString;
        if ([lower containsString:@"concealed"] || [lower containsString:@"transient"] || [lower containsString:@"autogenerated"] || [lower containsString:@"password"]) return @{ @"changeCount": @(count) };
    }
    NSString *text = [board stringForType:NSPasteboardTypeString];
    // If another copy happened while inspecting its types, retry at the next tick.
    if (board.changeCount != count) return @{ @"changeCount": @(count) };
    if (!text.length || [text lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > 32768) return @{ @"changeCount": @(count) };
    return @{ @"changeCount": @(count), @"text": text, @"frontmostApp": bundle };
}

static OSStatus readProperty(AudioObjectID device, AudioObjectPropertySelector selector, AudioObjectPropertyScope scope, void *data, UInt32 *size) {
    AudioObjectPropertyAddress address = { selector, scope, kAudioObjectPropertyElementMain };
    return AudioObjectGetPropertyData(device, &address, 0, NULL, size, data);
}
static NSArray *outputDevices(void) {
    AudioObjectPropertyAddress address = { kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain };
    UInt32 size = 0;
    if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &address, 0, NULL, &size) != noErr || size > 65536) return nil;
    NSMutableData *storage = [NSMutableData dataWithLength:size];
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, storage.mutableBytes) != noErr) return nil;
    AudioDeviceID selected = kAudioObjectUnknown;
    UInt32 selectedSize = sizeof(selected);
    readProperty(kAudioObjectSystemObject, kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal, &selected, &selectedSize);
    NSMutableArray *result = NSMutableArray.array;
    const AudioDeviceID *ids = storage.bytes;
    for (NSUInteger index = 0; index < size / sizeof(AudioDeviceID); ++index) {
        AudioDeviceID device = ids[index];
        AudioObjectPropertyAddress configuration = { kAudioDevicePropertyStreamConfiguration, kAudioObjectPropertyScopeOutput, kAudioObjectPropertyElementMain };
        UInt32 bufferSize = 0;
        if (AudioObjectGetPropertyDataSize(device, &configuration, 0, NULL, &bufferSize) != noErr || bufferSize < sizeof(AudioBufferList) || bufferSize > 65536) continue;
        NSMutableData *buffers = [NSMutableData dataWithLength:bufferSize];
        if (AudioObjectGetPropertyData(device, &configuration, 0, NULL, &bufferSize, buffers.mutableBytes) != noErr) continue;
        const AudioBufferList *list = buffers.bytes;
        UInt32 channels = 0;
        for (UInt32 i = 0; i < list->mNumberBuffers; ++i) channels += list->mBuffers[i].mNumberChannels;
        if (!channels) continue;
        CFStringRef name = NULL;
        UInt32 nameSize = sizeof(name);
        readProperty(device, kAudioObjectPropertyName, kAudioObjectPropertyScopeGlobal, &name, &nameSize);
        [result addObject:@{ @"id": @(device), @"name": name ? (__bridge NSString *)name : @"Audio output", @"selected": @(device == selected) }];
        if (name) CFRelease(name);
    }
    return result;
}
static NSDictionary *switchAudio(NSDictionary *request) {
    AudioDeviceID device = [request[@"deviceId"] unsignedIntValue];
    NSArray *devices = outputDevices();
    BOOL exists = NO;
    for (NSDictionary *candidate in devices) if ([candidate[@"id"] unsignedIntValue] == device) exists = YES;
    if (!exists) return failure(@"That output disconnected. Refresh devices and choose again.");
    AudioObjectPropertyAddress address = { kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal, kAudioObjectPropertyElementMain };
    Boolean writable = false;
    if (AudioObjectIsPropertySettable(kAudioObjectSystemObject, &address, &writable) != noErr || !writable) return failure(@"macOS does not allow changing the current output device.");
    OSStatus code = AudioObjectSetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, sizeof(device), &device);
    if (code != noErr) return failure([NSString stringWithFormat:@"Could not switch audio output (macOS %d).", (int)code]);
    NSArray *updated = outputDevices();
    return updated ? @{ @"devices": updated } : failure(@"The output change was requested, but devices could not be refreshed. Refresh outputs to check the current device.");
}
static NSDictionary *recognize(NSDictionary *request) {
    NSString *path = request[@"path"];
    if (![path isKindOfClass:NSString.class]) return failure(@"No capture was supplied.");
    VNRecognizeTextRequest *textRequest = VNRecognizeTextRequest.new;
    textRequest.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    textRequest.usesLanguageCorrection = YES;
    if (@available(macOS 13.0, *)) textRequest.automaticallyDetectsLanguage = YES;
    VNDetectBarcodesRequest *barcodeRequest = VNDetectBarcodesRequest.new;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithURL:[NSURL fileURLWithPath:path] options:@{}];
    NSError *error = nil;
    if (![handler performRequests:@[textRequest, barcodeRequest] error:&error]) return failure(error.localizedDescription ?: @"Could not recognize this capture.");
    NSMutableArray *lines = NSMutableArray.array;
    for (VNRecognizedTextObservation *observation in textRequest.results) {
        VNRecognizedText *candidate = [observation topCandidates:1].firstObject;
        if (candidate.string.length) [lines addObject:candidate.string];
    }
    NSMutableArray *codes = NSMutableArray.array;
    for (VNBarcodeObservation *observation in barcodeRequest.results) {
        if (observation.payloadStringValue.length && ![codes containsObject:observation.payloadStringValue]) [codes addObject:observation.payloadStringValue];
    }
    return @{ @"text": [lines componentsJoinedByString:@"\n"], @"codes": codes };
}

static NSDictionary *exportFile(NSDictionary *request) {
    NSString *name = request[@"filename"], *base64 = request[@"base64"];
    if (![name isKindOfClass:NSString.class] || ![base64 isKindOfClass:NSString.class] || !name.length || name.length > 240 || [name containsString:@"/"] || [name containsString:@":"] || [name isEqual:@"."] || [name isEqual:@".."]) return failure(@"Choose a valid export filename.");
    if (base64.length > 140000000) return failure(@"This export exceeds the 100 MiB limit. Export a smaller selection.");
    NSData *contents = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
    if (!contents || contents.length > 104857600) return failure(@"The export data is invalid or exceeds 100 MiB.");
    __block NSURL *destination = nil;
    __block NSString *chooserError = nil;
    void (^chooseDestination)(void) = ^{
        @try {
            NSSavePanel *panel = NSSavePanel.savePanel;
            panel.nameFieldStringValue = name;
            panel.canCreateDirectories = YES;
            panel.title = @"Export from Rabta";
            panel.prompt = @"Save";
            if ([panel runModal] == NSModalResponseOK) destination = panel.URL;
        } @catch (NSException *exception) {
            // This executes on main, so the caller thread's exception boundary
            // cannot protect it. Do not include file content in diagnostics.
            chooserError = @"The save dialog could not be opened. Try the export again.";
        }
    };
    if (NSThread.isMainThread) chooseDestination(); else dispatch_sync(dispatch_get_main_queue(), chooseDestination);
    if (chooserError) return failure(chooserError);
    if (!destination) return @{ @"cancelled": @YES };
    NSError *error = nil;
    if (![contents writeToURL:destination options:NSDataWritingAtomic error:&error]) return failure(error.localizedDescription ?: @"Could not save this export. Choose another destination.");
    return @{ @"cancelled": @NO, @"path": destination.path };
}

// All returned strings are malloc-owned and released by rabta_native_free.
char *rabta_native_toolkit(const char *operation, const char *json) {
    @autoreleasepool {
        @try {
            NSString *op = operation ? @(operation) : @"";
            NSData *data = json ? [@(json) dataUsingEncoding:NSUTF8StringEncoding] : nil;
            NSDictionary *request = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL] : @{};
            id result;
            if (![request isKindOfClass:NSDictionary.class]) result = failure(@"Invalid native request.");
            else if ([op isEqual:@"metrics"]) result = metrics();
            else if ([op isEqual:@"clipboardSnapshot"]) result = clipboardSnapshot(request);
            else if ([op isEqual:@"clipboardWrite"]) {
                NSString *text = request[@"text"];
                if (![text isKindOfClass:NSString.class] || [text lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > 1000000) result = failure(@"This text is too large for the clipboard.");
                else {
                    NSPasteboard *board = NSPasteboard.generalPasteboard;
                    [board clearContents];
                    if ([board setString:text forType:NSPasteboardTypeString]) result = @{ @"changeCount": @(board.changeCount) };
                    else result = failure(@"The clipboard could not be updated. Try again.");
                }
            }
            else if ([op isEqual:@"audioDevices"]) { NSArray *devices = outputDevices(); result = devices ? @{ @"devices": devices } : failure(@"Could not read audio outputs."); }
            else if ([op isEqual:@"audioSwitch"]) result = switchAudio(request);
            else if ([op isEqual:@"ocr"]) result = recognize(request);
            else if ([op isEqual:@"exportFile"]) result = exportFile(request);
            else result = failure(@"Unknown native operation.");
            NSData *encoded = [NSJSONSerialization dataWithJSONObject:result options:0 error:NULL];
            if (!encoded) return strdup("{\"error\":\"Could not encode the native response.\"}");
            return strdup([[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding].UTF8String);
        } @catch (NSException *exception) {
            // Avoid disclosing captured text or clipboard content in exceptions.
            return strdup("{\"error\":\"macOS could not complete the native action.\"}");
        }
    }
}
void rabta_native_free(char *value) { free(value); }
