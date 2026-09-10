// Independently authored macOS bridge. No network, arbitrary scripts, or disk persistence.
#import <AppKit/AppKit.h>
#import <AVFoundation/AVFoundation.h>
#import <QuartzCore/QuartzCore.h>
#import <ApplicationServices/ApplicationServices.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <Vision/Vision.h>
#import <CoreAudio/CoreAudio.h>
#import <IOKit/IOKitLib.h>
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
static NSString *stringValue(id value, NSUInteger limit) {
    if (![value isKindOfClass:NSString.class]) return nil;
    NSString *text = value;
    return text.length && text.length <= limit ? text : nil;
}
/// Runs `block` on the main thread and waits. AppKit panels and windows must be created there.
static void onMain(dispatch_block_t block) {
    if (NSThread.isMainThread) block(); else dispatch_sync(dispatch_get_main_queue(), block);
}

// ----------------------------------------------------------------------------
// Live metrics
// ----------------------------------------------------------------------------

/// GPU statistics come from each accelerator's IORegistry PerformanceStatistics
/// dictionary. Key names vary between Apple and third-party drivers; a missing
/// key is reported as unavailable rather than guessed.
static NSArray *gpuStatistics(void) {
    NSMutableArray *gpus = NSMutableArray.array;
    io_iterator_t iterator = 0;
    if (IOServiceGetMatchingServices(MACH_PORT_NULL, IOServiceMatching("IOAccelerator"), &iterator) != KERN_SUCCESS) return gpus;
    io_registry_entry_t entry;
    while ((entry = IOIteratorNext(iterator)) != 0 && gpus.count < 8) {
        CFMutableDictionaryRef raw = NULL;
        if (IORegistryEntryCreateCFProperties(entry, &raw, kCFAllocatorDefault, 0) == KERN_SUCCESS && raw) {
            NSDictionary *properties = CFBridgingRelease(raw);
            NSDictionary *statistics = properties[@"PerformanceStatistics"];
            if ([statistics isKindOfClass:NSDictionary.class]) {
                NSString *name = nil;
                CFTypeRef model = IORegistryEntrySearchCFProperty(entry, kIOServicePlane, CFSTR("model"), kCFAllocatorDefault, kIORegistryIterateRecursively | kIORegistryIterateParents);
                if (model) {
                    if (CFGetTypeID(model) == CFStringGetTypeID()) name = [(__bridge NSString *)model copy];
                    else if (CFGetTypeID(model) == CFDataGetTypeID()) {
                        // Registry strings arrive as NUL-terminated data.
                        NSData *bytes = (__bridge NSData *)model;
                        name = [[NSString alloc] initWithBytes:bytes.bytes length:strnlen(bytes.bytes, bytes.length) encoding:NSUTF8StringEncoding];
                    }
                    CFRelease(model);
                }
                name = [name stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
                if (!name.length) name = stringValue(properties[@"IOClass"], 120) ?: @"GPU";
                id utilization = statistics[@"Device Utilization %"] ?: statistics[@"GPU Activity(%)"];
                id memory = statistics[@"In use system memory"] ?: statistics[@"Alloc system memory"];
                [gpus addObject:@{
                    @"name": name,
                    @"utilization": [utilization isKindOfClass:NSNumber.class] ? utilization : NSNull.null,
                    @"renderer": [statistics[@"Renderer Utilization %"] isKindOfClass:NSNumber.class] ? statistics[@"Renderer Utilization %"] : NSNull.null,
                    @"tiler": [statistics[@"Tiler Utilization %"] isKindOfClass:NSNumber.class] ? statistics[@"Tiler Utilization %"] : NSNull.null,
                    @"memoryUsed": [memory isKindOfClass:NSNumber.class] ? memory : NSNull.null,
                }];
            }
        }
        IOObjectRelease(entry);
    }
    IOObjectRelease(iterator);
    return gpus;
}

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
    result[@"gpus"] = gpuStatistics();
    result[@"uptimeSeconds"] = @(NSProcessInfo.processInfo.systemUptime);
    return result;
}

// ----------------------------------------------------------------------------
// Clipboard
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Audio output
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Screen text
// ----------------------------------------------------------------------------

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

// ----------------------------------------------------------------------------
// Files: export, choose, trash
// ----------------------------------------------------------------------------

static NSDictionary *exportFile(NSDictionary *request) {
    NSString *name = request[@"filename"], *base64 = request[@"base64"];
    if (![name isKindOfClass:NSString.class] || ![base64 isKindOfClass:NSString.class] || !name.length || name.length > 240 || [name containsString:@"/"] || [name containsString:@":"] || [name isEqual:@"."] || [name isEqual:@".."]) return failure(@"Choose a valid export filename.");
    if (base64.length > 140000000) return failure(@"This export exceeds the 100 MiB limit. Export a smaller selection.");
    NSData *contents = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
    if (!contents || contents.length > 104857600) return failure(@"The export data is invalid or exceeds 100 MiB.");
    __block NSURL *destination = nil;
    __block NSString *chooserError = nil;
    onMain(^{
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
    });
    if (chooserError) return failure(chooserError);
    if (!destination) return @{ @"cancelled": @YES };
    NSError *error = nil;
    if (![contents writeToURL:destination options:NSDataWritingAtomic error:&error]) return failure(error.localizedDescription ?: @"Could not save this export. Choose another destination.");
    return @{ @"cancelled": @NO, @"path": destination.path };
}

/// An explicit NSOpenPanel. `kind` limits the choice to a disk image, an app
/// bundle, or a folder; the chosen path is returned for the caller to validate.
static NSDictionary *openPanel(NSDictionary *request) {
    NSString *kind = stringValue(request[@"kind"], 20) ?: @"any";
    NSString *title = stringValue(request[@"title"], 120) ?: @"Choose";
    __block NSURL *chosen = nil;
    __block NSString *problem = nil;
    onMain(^{
        @try {
            NSOpenPanel *panel = NSOpenPanel.openPanel;
            panel.title = title;
            panel.prompt = @"Choose";
            panel.allowsMultipleSelection = NO;
            panel.canChooseDirectories = [kind isEqual:@"folder"];
            panel.canChooseFiles = ![kind isEqual:@"folder"];
            panel.treatsFilePackagesAsDirectories = NO;
            if ([kind isEqual:@"dmg"]) { UTType *type = [UTType typeWithFilenameExtension:@"dmg"]; if (type) panel.allowedContentTypes = @[type]; }
            else if ([kind isEqual:@"app"]) panel.allowedContentTypes = @[UTTypeApplicationBundle];
            if ([panel runModal] == NSModalResponseOK) chosen = panel.URL;
        } @catch (NSException *exception) {
            problem = @"The file chooser could not be opened. Try again.";
        }
    });
    if (problem) return failure(problem);
    if (!chosen) return @{ @"cancelled": @YES };
    return @{ @"cancelled": @NO, @"path": chosen.path };
}

/// Moves each path to the Trash through Finder's recoverable mechanism.
/// Results are reported per item; one failure never stops the others.
static NSDictionary *trashItems(NSDictionary *request) {
    NSArray *paths = request[@"paths"];
    if (![paths isKindOfClass:NSArray.class] || !paths.count || paths.count > 500) return failure(@"Choose between 1 and 500 items to move to the Trash.");
    NSMutableArray *results = NSMutableArray.array;
    for (id item in paths) {
        NSString *path = stringValue(item, 4096);
        if (!path || ![path hasPrefix:@"/"]) { [results addObject:@{ @"path": [item isKindOfClass:NSString.class] ? item : @"", @"ok": @NO, @"error": @"Invalid path." }]; continue; }
        NSURL *trashed = nil;
        NSError *error = nil;
        BOOL ok = [NSFileManager.defaultManager trashItemAtURL:[NSURL fileURLWithPath:path] resultingItemURL:&trashed error:&error];
        [results addObject:@{ @"path": path, @"ok": @(ok), @"error": ok ? NSNull.null : (error.localizedDescription ?: @"Could not move this item to the Trash."), @"trashedPath": emptyValue(trashed.path) }];
    }
    return @{ @"results": results };
}

// ----------------------------------------------------------------------------
// Applications and displays
// ----------------------------------------------------------------------------

static NSDictionary *frameDictionary(NSRect frame, CGFloat primaryTop) {
    // Report in the top-left coordinate space Accessibility and window tools use.
    return @{ @"x": @(frame.origin.x), @"y": @(primaryTop - frame.origin.y - frame.size.height), @"width": @(frame.size.width), @"height": @(frame.size.height) };
}
static NSDictionary *displays(void) {
    __block NSMutableArray *result = NSMutableArray.array;
    onMain(^{
        NSArray<NSScreen *> *screens = NSScreen.screens;
        if (!screens.count) return;
        NSRect first = screens[0].frame;
        CGFloat primaryTop = first.origin.y + first.size.height;
        NSUInteger index = 0;
        for (NSScreen *screen in screens) {
            NSString *name = [NSString stringWithFormat:@"Display %lu", (unsigned long)index + 1];
            if (@available(macOS 10.15, *)) name = screen.localizedName ?: name;
            [result addObject:@{
                @"id": [NSString stringWithFormat:@"%@", screen.deviceDescription[@"NSScreenNumber"] ?: @(index)],
                @"index": @(index + 1),
                @"name": name,
                @"primary": @(index == 0),
                @"scale": @(screen.backingScaleFactor),
                @"frame": frameDictionary(screen.frame, primaryTop),
                @"visibleFrame": frameDictionary(screen.visibleFrame, primaryTop),
            }];
            index++;
        }
    });
    return @{ @"displays": result };
}

static NSString *policyName(NSApplicationActivationPolicy policy) {
    switch (policy) {
        case NSApplicationActivationPolicyRegular: return @"regular";
        case NSApplicationActivationPolicyAccessory: return @"accessory";
        default: return @"background";
    }
}
/// Running applications with a count of their ordinary (layer 0) windows.
/// Window counts come from the window server and include minimized windows;
/// window titles are never requested, so Screen Recording access is not needed.
static NSDictionary *runningApplications(NSDictionary *request) {
    BOOL includeBackground = [request[@"includeBackground"] boolValue];
    NSMutableDictionary *counts = NSMutableDictionary.dictionary;
    BOOL windowsReadable = NO;
    CFArrayRef windows = CGWindowListCopyWindowInfo(kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (windows) {
        windowsReadable = YES;
        for (NSDictionary *window in (__bridge NSArray *)windows) {
            if ([window[(__bridge NSString *)kCGWindowLayer] intValue] != 0) continue;
            NSNumber *pid = window[(__bridge NSString *)kCGWindowOwnerPID];
            NSDictionary *bounds = window[(__bridge NSString *)kCGWindowBounds];
            if (!pid || [bounds[@"Width"] doubleValue] < 40 || [bounds[@"Height"] doubleValue] < 40) continue;
            counts[pid] = @([counts[pid] intValue] + 1);
        }
        CFRelease(windows);
    }
    NSMutableArray *apps = NSMutableArray.array;
    for (NSRunningApplication *app in NSWorkspace.sharedWorkspace.runningApplications) {
        if (app.terminated) continue;
        if (app.activationPolicy == NSApplicationActivationPolicyProhibited && !includeBackground) continue;
        [apps addObject:@{
            @"pid": @(app.processIdentifier),
            @"bundleId": app.bundleIdentifier ?: @"",
            @"name": app.localizedName ?: (app.bundleURL.lastPathComponent ?: @"Application"),
            @"policy": policyName(app.activationPolicy),
            @"windows": counts[@(app.processIdentifier)] ?: @0,
            @"active": @(app.active),
            @"hidden": @(app.hidden),
            @"path": app.bundleURL.path ?: @"",
        }];
    }
    return @{ @"apps": apps, @"windowsReadable": @(windowsReadable), @"ownPid": @(NSProcessInfo.processInfo.processIdentifier) };
}

static NSArray *protectedBundles(void) {
    return @[@"com.apple.finder", @"com.apple.dock", @"com.apple.systemuiserver", @"com.apple.loginwindow", @"com.apple.controlcenter",
             @"com.apple.notificationcenterui", @"com.apple.windowmanager", @"com.apple.spotlight", @"com.apple.coreservices.uiagent"];
}
/// Asks an app to quit through its normal Quit path, or force-terminates it.
/// System components and Rabta itself are refused before any request is sent.
static NSDictionary *terminateApplication(NSDictionary *request) {
    pid_t pid = (pid_t)[request[@"pid"] intValue];
    if (pid <= 1) return failure(@"Choose a running application.");
    if (pid == NSProcessInfo.processInfo.processIdentifier) return failure(@"Quit Rabta from its own menu instead.");
    NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
    if (!app || app.terminated) return failure(@"That app is no longer running. Refresh the list.");
    NSString *bundle = app.bundleIdentifier.lowercaseString ?: @"";
    for (NSString *item in protectedBundles()) if ([item isEqual:bundle]) return failure(@"That is part of macOS and stays running.");
    BOOL force = [request[@"force"] boolValue];
    BOOL requested = force ? [app forceTerminate] : [app terminate];
    return @{ @"requested": @(requested), @"name": app.localizedName ?: @"", @"terminated": @(app.terminated), @"force": @(force) };
}

static NSDictionary *launchApplication(NSDictionary *request) {
    NSString *path = stringValue(request[@"path"], 4096);
    if (!path || ![path hasSuffix:@".app"]) return failure(@"Choose an application bundle.");
    NSURL *url = [NSURL fileURLWithPath:path];
    NSBundle *bundle = [NSBundle bundleWithURL:url];
    if (!bundle || !bundle.bundleIdentifier) return failure(@"That does not look like an installed application.");
    NSWorkspaceOpenConfiguration *configuration = NSWorkspaceOpenConfiguration.configuration;
    configuration.activates = YES;
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    __block NSString *problem = nil;
    __block pid_t pid = 0;
    [NSWorkspace.sharedWorkspace openApplicationAtURL:url configuration:configuration completionHandler:^(NSRunningApplication *app, NSError *error) {
        if (error) problem = error.localizedDescription ?: @"macOS could not open this app.";
        else pid = app.processIdentifier;
        dispatch_semaphore_signal(done);
    }];
    if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 45 * NSEC_PER_SEC)) != 0) return failure(@"The app did not respond to the launch request in time.");
    if (problem) return failure(problem);
    return @{ @"pid": @(pid), @"bundleId": bundle.bundleIdentifier };
}

static NSDictionary *applicationRecord(NSURL *url) {
    NSBundle *bundle = [NSBundle bundleWithURL:url];
    if (!bundle) return nil;
    NSDictionary *info = bundle.infoDictionary;
    NSString *name = stringValue(info[@"CFBundleDisplayName"], 200) ?: stringValue(info[@"CFBundleName"], 200) ?: [url.lastPathComponent stringByDeletingPathExtension];
    return @{
        @"path": url.path,
        @"name": name,
        @"bundleId": bundle.bundleIdentifier ?: @"",
        @"version": stringValue(info[@"CFBundleShortVersionString"], 60) ?: (stringValue(info[@"CFBundleVersion"], 60) ?: @""),
    };
}
/// Scans the given application folders one level deep (plus a Utilities
/// subfolder). Nothing is launched, read beyond Info.plist, or modified.
static NSDictionary *installedApplications(NSDictionary *request) {
    NSArray *directories = request[@"directories"];
    if (![directories isKindOfClass:NSArray.class] || directories.count > 8) return failure(@"Choose the application folders to scan.");
    NSMutableArray *apps = NSMutableArray.array;
    NSFileManager *manager = NSFileManager.defaultManager;
    for (id item in directories) {
        NSString *directory = stringValue(item, 1024);
        if (!directory) continue;
        NSMutableArray<NSURL *> *roots = [NSMutableArray arrayWithObject:[NSURL fileURLWithPath:directory]];
        [roots addObject:[NSURL fileURLWithPath:[directory stringByAppendingPathComponent:@"Utilities"]]];
        for (NSURL *root in roots) {
            NSArray *contents = [manager contentsOfDirectoryAtURL:root includingPropertiesForKeys:@[NSURLIsPackageKey] options:NSDirectoryEnumerationSkipsHiddenFiles error:NULL];
            for (NSURL *entry in contents) {
                if (![entry.pathExtension isEqual:@"app"]) continue;
                NSDictionary *record = applicationRecord(entry);
                if (record) [apps addObject:record];
                if (apps.count >= 2000) break;
            }
        }
    }
    [apps sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) { return [a[@"name"] localizedCaseInsensitiveCompare:b[@"name"]]; }];
    return @{ @"apps": apps };
}

// ----------------------------------------------------------------------------
// Camera preview
// ----------------------------------------------------------------------------

static AVCaptureSession *cameraSession = nil;
static NSWindow *cameraWindow = nil;
static id cameraCloseObserver = nil;

static NSString *cameraAuthorization(void) {
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo]) {
        case AVAuthorizationStatusAuthorized: return @"authorized";
        case AVAuthorizationStatusDenied: return @"denied";
        case AVAuthorizationStatusRestricted: return @"restricted";
        default: return @"notDetermined";
    }
}
static NSArray<AVCaptureDevice *> *cameraDeviceList(void) {
    NSMutableArray *types = [NSMutableArray arrayWithObject:AVCaptureDeviceTypeBuiltInWideAngleCamera];
    if (@available(macOS 14.0, *)) [types addObject:AVCaptureDeviceTypeExternal];
    else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        [types addObject:AVCaptureDeviceTypeExternalUnknown];
#pragma clang diagnostic pop
    }
    AVCaptureDeviceDiscoverySession *session = [AVCaptureDeviceDiscoverySession discoverySessionWithDeviceTypes:types mediaType:AVMediaTypeVideo position:AVCaptureDevicePositionUnspecified];
    return session.devices;
}
static void stopCameraOnMain(void) {
    // Main thread only. Tears down the session before the window so no frame
    // is delivered to a released layer.
    if (cameraCloseObserver) { [NSNotificationCenter.defaultCenter removeObserver:cameraCloseObserver]; cameraCloseObserver = nil; }
    if (cameraSession) { [cameraSession stopRunning]; cameraSession = nil; }
    if (cameraWindow) { NSWindow *window = cameraWindow; cameraWindow = nil; [window orderOut:nil]; }
}
static NSDictionary *cameraDevices(void) {
    NSMutableArray *result = NSMutableArray.array;
    for (AVCaptureDevice *device in cameraDeviceList()) {
        [result addObject:@{ @"id": device.uniqueID ?: @"", @"name": device.localizedName ?: @"Camera", @"connected": @(device.connected) }];
    }
    __block BOOL running = NO;
    onMain(^{ running = cameraSession.running; });
    return @{ @"devices": result, @"authorization": cameraAuthorization(), @"running": @(running) };
}
static NSDictionary *cameraStart(NSDictionary *request) {
    NSString *identifier = stringValue(request[@"deviceId"], 300);
    if (!identifier) return failure(@"Choose a camera.");
    if ([cameraAuthorization() isEqual:@"notDetermined"]) {
        dispatch_semaphore_t done = dispatch_semaphore_create(0);
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) { (void)granted; dispatch_semaphore_signal(done); }];
        dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 180 * NSEC_PER_SEC));
    }
    NSString *state = cameraAuthorization();
    if (![state isEqual:@"authorized"]) return failure(@"Camera access is not allowed for Rabta. Allow it in System Settings → Privacy & Security → Camera.");
    AVCaptureDevice *device = nil;
    for (AVCaptureDevice *candidate in cameraDeviceList()) if ([candidate.uniqueID isEqual:identifier]) device = candidate;
    if (!device) return failure(@"That camera is no longer connected. Refresh cameras.");
    NSError *error = nil;
    AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&error];
    if (!input) return failure(error.localizedDescription ?: @"This camera cannot be opened. It may be in use by another app.");
    __block NSString *problem = nil;
    onMain(^{
        @try {
            stopCameraOnMain();
            AVCaptureSession *session = AVCaptureSession.new;
            session.sessionPreset = AVCaptureSessionPresetMedium;
            if (![session canAddInput:input]) { problem = @"This camera cannot be previewed."; return; }
            [session addInput:input];
            NSRect frame = NSMakeRect(0, 0, 480, 360);
            NSWindow *window = [[NSWindow alloc] initWithContentRect:frame styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable) backing:NSBackingStoreBuffered defer:NO];
            window.title = [NSString stringWithFormat:@"%@ · Rabta camera preview", device.localizedName ?: @"Camera"];
            window.level = NSFloatingWindowLevel;
            window.releasedWhenClosed = NO;
            window.contentAspectRatio = NSMakeSize(4, 3);
            NSView *content = window.contentView;
            content.wantsLayer = YES;
            AVCaptureVideoPreviewLayer *preview = [AVCaptureVideoPreviewLayer layerWithSession:session];
            preview.videoGravity = AVLayerVideoGravityResizeAspect;
            preview.frame = content.bounds;
            preview.autoresizingMask = kCALayerWidthSizable | kCALayerHeightSizable;
            [content.layer addSublayer:preview];
            [window center];
            cameraCloseObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowWillCloseNotification object:window queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) { (void)note; stopCameraOnMain(); }];
            cameraSession = session;
            cameraWindow = window;
            [session startRunning];
            [window makeKeyAndOrderFront:nil];
        } @catch (NSException *exception) {
            stopCameraOnMain();
            problem = @"The camera preview window could not be opened.";
        }
    });
    if (problem) return failure(problem);
    return @{ @"running": @YES, @"name": device.localizedName ?: @"Camera" };
}
static NSDictionary *cameraStop(void) {
    onMain(^{ stopCameraOnMain(); });
    return @{ @"running": @NO };
}

// ----------------------------------------------------------------------------
// Input service: one session event tap, explicitly configured
// ----------------------------------------------------------------------------
//
// All state is guarded by inputLock. The tap callback reads a copy of the
// flags per event. Synthetic events carry a marker in their user data so the
// tap never re-processes its own output. Nothing here persists to disk.

typedef struct {
    BOOL invertVertical, invertHorizontal;
    BOOL clickDebounce; double clickDebounceSeconds;
    BOOL keyDebounce; double keyDebounceSeconds;
    BOOL quitProtection; BOOL quitHold; double quitHoldSeconds; BOOL protectClose;
    BOOL pastePlain;
    BOOL cleaning;
    BOOL focusFollowsMouse; double focusDelaySeconds;
} InputFlags;

static const int64_t kRabtaEventMarker = 0x5241425441;
static NSObject *inputLock = nil;
static InputFlags inputFlags;
static NSArray<NSDictionary *> *inputButtons = nil;   // [{button, keyCode, flags}]
static NSArray<NSDictionary *> *inputSnippets = nil;  // [{trigger, text}]
static NSSet<NSString *> *inputExcluded = nil;        // bundle IDs where the tap passes everything through
static NSSet<NSString *> *inputQuitExcluded = nil;    // bundle IDs without quit protection
static BOOL inputRunning = NO;
static NSString *inputError = nil;
static NSString *inputLastEvent = nil;
static uint64_t inputExpansions = 0;
static CFMachPortRef inputTap = NULL;
static CFRunLoopRef inputRunLoop = NULL;
static CFRunLoopSourceRef inputSource = NULL;
static CFRunLoopTimerRef inputTimer = NULL;
static dispatch_semaphore_t inputStarted = nil;
static dispatch_semaphore_t inputStopped = nil;

// Per-event working state, touched only from the tap thread.
static double lastMouseDown[32];
static BOOL swallowMouseUp[32];
static double lastKeyDown[256];
static double quitTapTime = 0, quitHoldStart = 0;
static int quitTapKey = -1;
static pid_t quitTapPid = 0;
static int escapeCount = 0;
static double lastEscape = 0;
static double lastMoveTime = 0;
static CGPoint lastMovePoint;
static BOOL focusHandled = YES;
static NSMutableString *typedBuffer = nil;
static pid_t typedPid = 0;
static NSMutableDictionary<NSNumber *, NSString *> *bundleCache = nil;
static double bundleCacheTime = 0;

static double nowSeconds(void) { return CFAbsoluteTimeGetCurrent(); }
static NSString *bundleForPid(pid_t pid) {
    if (pid <= 0) return @"";
    double now = nowSeconds();
    if (!bundleCache || now - bundleCacheTime > 30 || bundleCache.count > 300) { bundleCache = NSMutableDictionary.dictionary; bundleCacheTime = now; }
    NSString *cached = bundleCache[@(pid)];
    if (cached) return cached;
    NSString *bundle = [NSRunningApplication runningApplicationWithProcessIdentifier:pid].bundleIdentifier.lowercaseString ?: @"";
    bundleCache[@(pid)] = bundle;
    return bundle;
}
static void postKeyCombination(pid_t pid, CGKeyCode key, CGEventFlags modifiers) {
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);
    CGEventRef down = CGEventCreateKeyboardEvent(source, key, true);
    CGEventRef up = CGEventCreateKeyboardEvent(source, key, false);
    if (down && up) {
        CGEventSetFlags(down, modifiers);
        CGEventSetFlags(up, modifiers);
        CGEventSetIntegerValueField(down, kCGEventSourceUserData, kRabtaEventMarker);
        CGEventSetIntegerValueField(up, kCGEventSourceUserData, kRabtaEventMarker);
        if (pid > 0) { CGEventPostToPid(pid, down); CGEventPostToPid(pid, up); }
        else { CGEventPost(kCGSessionEventTap, down); CGEventPost(kCGSessionEventTap, up); }
    }
    if (down) CFRelease(down);
    if (up) CFRelease(up);
    if (source) CFRelease(source);
}
/// Replaces the clipboard with plain text, pastes it into `pid`, and restores
/// the previous clipboard contents shortly afterwards.
static void pasteText(pid_t pid, NSString *text) {
    NSPasteboard *board = NSPasteboard.generalPasteboard;
    NSMutableArray *saved = NSMutableArray.array;
    for (NSPasteboardItem *item in board.pasteboardItems) {
        NSMutableDictionary *entry = NSMutableDictionary.dictionary;
        for (NSPasteboardType type in item.types) { NSData *data = [item dataForType:type]; if (data && data.length < 20000000) entry[type] = data; }
        if (entry.count) [saved addObject:entry];
        if (saved.count >= 16) break;
    }
    [board clearContents];
    [board setString:text forType:NSPasteboardTypeString];
    postKeyCombination(pid, 9, kCGEventFlagMaskCommand);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.4 * NSEC_PER_SEC)), dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSMutableArray *items = NSMutableArray.array;
        for (NSDictionary *entry in saved) {
            NSPasteboardItem *item = NSPasteboardItem.new;
            for (NSPasteboardType type in entry) [item setData:entry[type] forType:type];
            [items addObject:item];
        }
        [board clearContents];
        if (items.count) [board writeObjects:items];
    });
}
static NSString *expandVariables(NSString *text) {
    if (![text containsString:@"{"]) return text;
    NSDateFormatter *date = NSDateFormatter.new; date.dateStyle = NSDateFormatterMediumStyle; date.timeStyle = NSDateFormatterNoStyle;
    NSDateFormatter *time = NSDateFormatter.new; time.dateStyle = NSDateFormatterNoStyle; time.timeStyle = NSDateFormatterShortStyle;
    NSDateFormatter *iso = NSDateFormatter.new; iso.dateFormat = @"yyyy-MM-dd";
    NSString *clipboard = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString] ?: @"";
    if (clipboard.length > 100000) clipboard = @"";
    NSDate *current = NSDate.date;
    NSString *result = [text stringByReplacingOccurrencesOfString:@"{date}" withString:[date stringFromDate:current]];
    result = [result stringByReplacingOccurrencesOfString:@"{isodate}" withString:[iso stringFromDate:current]];
    result = [result stringByReplacingOccurrencesOfString:@"{time}" withString:[time stringFromDate:current]];
    result = [result stringByReplacingOccurrencesOfString:@"{clipboard}" withString:clipboard];
    return result;
}
static AXUIElementRef copyWindowAncestor(AXUIElementRef element) {
    AXUIElementRef current = element;
    CFRetain(current);
    for (int depth = 0; depth < 24 && current; depth++) {
        CFTypeRef role = NULL;
        if (AXUIElementCopyAttributeValue(current, kAXRoleAttribute, &role) == kAXErrorSuccess && role) {
            BOOL isWindow = CFGetTypeID(role) == CFStringGetTypeID() && CFStringCompare((CFStringRef)role, kAXWindowRole, 0) == kCFCompareEqualTo;
            CFRelease(role);
            if (isWindow) return current;
        }
        CFTypeRef parent = NULL;
        AXError code = AXUIElementCopyAttributeValue(current, kAXParentAttribute, &parent);
        CFRelease(current);
        current = NULL;
        if (code != kAXErrorSuccess || !parent || CFGetTypeID(parent) != AXUIElementGetTypeID()) { if (parent) CFRelease(parent); return NULL; }
        current = (AXUIElementRef)parent;
    }
    if (current) CFRelease(current);
    return NULL;
}
static void focusTimerFired(CFRunLoopTimerRef timer, void *info) {
    (void)timer; (void)info;
    InputFlags flags;
    NSSet *excluded;
    @synchronized(inputLock) { flags = inputFlags; excluded = inputExcluded; }
    if (!flags.focusFollowsMouse || focusHandled || lastMoveTime == 0) return;
    if (nowSeconds() - lastMoveTime < flags.focusDelaySeconds) return;
    focusHandled = YES;
    if (CGEventSourceButtonState(kCGEventSourceStateCombinedSessionState, kCGMouseButtonLeft) || CGEventSourceButtonState(kCGEventSourceStateCombinedSessionState, kCGMouseButtonRight)) return;
    if (CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState) & (kCGEventFlagMaskCommand | kCGEventFlagMaskAlternate | kCGEventFlagMaskControl | kCGEventFlagMaskShift)) return;
    AXUIElementRef systemWide = AXUIElementCreateSystemWide();
    if (!systemWide) return;
    AXUIElementRef element = NULL;
    AXError code = AXUIElementCopyElementAtPosition(systemWide, (float)lastMovePoint.x, (float)lastMovePoint.y, &element);
    CFRelease(systemWide);
    if (code != kAXErrorSuccess || !element) return;
    pid_t pid = 0;
    AXUIElementGetPid(element, &pid);
    AXUIElementRef window = copyWindowAncestor(element);
    CFRelease(element);
    if (!window) return; // The desktop, the menu bar, or an element without a window never steals focus.
    NSRunningApplication *app = pid > 0 ? [NSRunningApplication runningApplicationWithProcessIdentifier:pid] : nil;
    NSString *bundle = app.bundleIdentifier.lowercaseString ?: @"";
    if (!app || app.active || pid == NSProcessInfo.processInfo.processIdentifier || [excluded containsObject:bundle] || app.activationPolicy != NSApplicationActivationPolicyRegular) { CFRelease(window); return; }
    AXUIElementPerformAction(window, kAXRaiseAction);
    CFRelease(window);
    dispatch_async(dispatch_get_main_queue(), ^{
        // activateWithOptions: is deprecated from macOS 14 but declared in every
        // SDK this project builds with; the newer -activate is not, so the
        // deprecated call is used everywhere rather than gated by availability.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
        [app activateWithOptions:0];
#pragma clang diagnostic pop
    });
}
static CGEventRef inputCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void *info) {
    (void)proxy; (void)info;
    if (type == kCGEventTapDisabledByTimeout || type == kCGEventTapDisabledByUserInput) { if (inputTap) CGEventTapEnable(inputTap, true); return event; }
    if (CGEventGetIntegerValueField(event, kCGEventSourceUserData) == kRabtaEventMarker) return event;
    InputFlags flags;
    NSArray *buttons, *snippets;
    NSSet *excluded, *quitExcluded;
    @synchronized(inputLock) { flags = inputFlags; buttons = inputButtons; snippets = inputSnippets; excluded = inputExcluded; quitExcluded = inputQuitExcluded; }
    double now = nowSeconds();
    pid_t target = (pid_t)CGEventGetIntegerValueField(event, kCGEventTargetUnixProcessID);
    int64_t keyCode = (type == kCGEventKeyDown || type == kCGEventKeyUp) ? CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode) : -1;
    BOOL autorepeat = type == kCGEventKeyDown && CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat) != 0;

    // Cleaning mode locks the keyboard everywhere. Escape three times within
    // two seconds ends it; the in-app Stop button still works with the mouse.
    if (flags.cleaning && (type == kCGEventKeyDown || type == kCGEventKeyUp || type == kCGEventFlagsChanged)) {
        if (type == kCGEventKeyDown && keyCode == 53 && !autorepeat) {
            if (now - lastEscape > 2.0) escapeCount = 0;
            escapeCount++;
            lastEscape = now;
            if (escapeCount >= 3) { escapeCount = 0; @synchronized(inputLock) { inputFlags.cleaning = NO; inputLastEvent = @"Cleaning mode ended with Escape."; } }
        }
        return NULL;
    }
    NSString *bundle = bundleForPid(target);
    if (excluded.count && [excluded containsObject:bundle]) return event;

    if (type == kCGEventScrollWheel) {
        if ((flags.invertVertical || flags.invertHorizontal) && CGEventGetIntegerValueField(event, kCGScrollWheelEventIsContinuous) == 0) {
            if (flags.invertVertical) {
                CGEventSetIntegerValueField(event, kCGScrollWheelEventDeltaAxis1, -CGEventGetIntegerValueField(event, kCGScrollWheelEventDeltaAxis1));
                CGEventSetIntegerValueField(event, kCGScrollWheelEventPointDeltaAxis1, -CGEventGetIntegerValueField(event, kCGScrollWheelEventPointDeltaAxis1));
                CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis1, -CGEventGetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis1));
            }
            if (flags.invertHorizontal) {
                CGEventSetIntegerValueField(event, kCGScrollWheelEventDeltaAxis2, -CGEventGetIntegerValueField(event, kCGScrollWheelEventDeltaAxis2));
                CGEventSetIntegerValueField(event, kCGScrollWheelEventPointDeltaAxis2, -CGEventGetIntegerValueField(event, kCGScrollWheelEventPointDeltaAxis2));
                CGEventSetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis2, -CGEventGetDoubleValueField(event, kCGScrollWheelEventFixedPtDeltaAxis2));
            }
        }
        return event;
    }
    if (type == kCGEventMouseMoved) {
        lastMoveTime = now;
        lastMovePoint = CGEventGetLocation(event);
        focusHandled = NO;
        return event;
    }
    if (type == kCGEventLeftMouseDown || type == kCGEventRightMouseDown || type == kCGEventOtherMouseDown) {
        int64_t button = CGEventGetIntegerValueField(event, kCGMouseEventButtonNumber);
        typedBuffer = nil;
        if (button < 0 || button >= 32) return event;
        if (flags.clickDebounce && now - lastMouseDown[button] < flags.clickDebounceSeconds) { swallowMouseUp[button] = YES; return NULL; }
        lastMouseDown[button] = now;
        if (type == kCGEventOtherMouseDown && buttons.count) {
            for (NSDictionary *mapping in buttons) {
                if ([mapping[@"button"] longLongValue] != button) continue;
                postKeyCombination(target, (CGKeyCode)[mapping[@"keyCode"] intValue], (CGEventFlags)[mapping[@"flags"] unsignedLongLongValue]);
                swallowMouseUp[button] = YES;
                return NULL;
            }
        }
        return event;
    }
    if (type == kCGEventLeftMouseUp || type == kCGEventRightMouseUp || type == kCGEventOtherMouseUp) {
        int64_t button = CGEventGetIntegerValueField(event, kCGMouseEventButtonNumber);
        if (button >= 0 && button < 32 && swallowMouseUp[button]) { swallowMouseUp[button] = NO; return NULL; }
        return event;
    }
    if (type != kCGEventKeyDown && type != kCGEventKeyUp) return event;

    CGEventFlags modifiers = CGEventGetFlags(event);
    BOOL command = (modifiers & kCGEventFlagMaskCommand) != 0;
    BOOL option = (modifiers & kCGEventFlagMaskAlternate) != 0;
    BOOL control = (modifiers & kCGEventFlagMaskControl) != 0;
    BOOL shift = (modifiers & kCGEventFlagMaskShift) != 0;

    if (type == kCGEventKeyUp) {
        if (flags.quitProtection && flags.quitHold && keyCode == quitTapKey) quitHoldStart = 0;
        return event;
    }
    // Keyboard debounce: a second physical press of the same key inside the
    // window is dropped. Held-key repeats carry the autorepeat flag and pass.
    if (flags.keyDebounce && !autorepeat && keyCode >= 0 && keyCode < 256) {
        if (now - lastKeyDown[keyCode] < flags.keyDebounceSeconds) return NULL;
        lastKeyDown[keyCode] = now;
    }
    if (flags.quitProtection && command && !option && !control && (keyCode == 12 || (keyCode == 13 && flags.protectClose && !shift)) && ![quitExcluded containsObject:bundle]) {
        if (flags.quitHold) {
            if (!autorepeat) { quitHoldStart = now; quitTapKey = (int)keyCode; return NULL; }
            if (quitHoldStart > 0 && now - quitHoldStart >= flags.quitHoldSeconds) {
                quitHoldStart = 0;
                postKeyCombination(target, (CGKeyCode)keyCode, modifiers & (kCGEventFlagMaskCommand | kCGEventFlagMaskShift));
            }
            return NULL;
        }
        if (autorepeat) return NULL;
        if (now - quitTapTime < 1.0 && quitTapKey == keyCode && quitTapPid == target) { quitTapTime = 0; return event; }
        quitTapTime = now; quitTapKey = (int)keyCode; quitTapPid = target;
        return NULL;
    }
    if (flags.pastePlain && command && shift && !option && !control && keyCode == 9 && !autorepeat) {
        NSString *text = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
        if (!text.length || text.length > 5000000) return event;
        pasteText(target, text);
        return NULL;
    }
    if (snippets.count && !command && !control && !autorepeat) {
        if (typedPid != target) { typedBuffer = nil; typedPid = target; }
        if (keyCode == 51) { if (typedBuffer.length) [typedBuffer deleteCharactersInRange:NSMakeRange(typedBuffer.length - 1, 1)]; return event; }
        UniChar characters[8];
        UniCharCount length = 0;
        CGEventKeyboardGetUnicodeString(event, 8, &length, characters);
        if (!length || characters[0] < 32 || characters[0] == 127) { typedBuffer = nil; return event; }
        if (!typedBuffer) typedBuffer = NSMutableString.string;
        [typedBuffer appendString:[NSString stringWithCharacters:characters length:length]];
        if (typedBuffer.length > 64) [typedBuffer deleteCharactersInRange:NSMakeRange(0, typedBuffer.length - 64)];
        for (NSDictionary *snippet in snippets) {
            NSString *trigger = snippet[@"trigger"];
            if (![typedBuffer hasSuffix:trigger]) continue;
            typedBuffer = nil;
            for (NSUInteger i = 1; i < trigger.length; i++) postKeyCombination(target, 51, 0);
            pasteText(target, expandVariables(snippet[@"text"]));
            @synchronized(inputLock) { inputExpansions++; }
            return NULL;
        }
    }
    return event;
}
@interface RabtaInputService : NSObject
@end
@implementation RabtaInputService
+ (void)run:(id)unused {
    (void)unused;
    @autoreleasepool {
        CGEventMask mask = CGEventMaskBit(kCGEventScrollWheel) | CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp) | CGEventMaskBit(kCGEventFlagsChanged)
            | CGEventMaskBit(kCGEventMouseMoved) | CGEventMaskBit(kCGEventLeftMouseDown) | CGEventMaskBit(kCGEventLeftMouseUp)
            | CGEventMaskBit(kCGEventRightMouseDown) | CGEventMaskBit(kCGEventRightMouseUp) | CGEventMaskBit(kCGEventOtherMouseDown) | CGEventMaskBit(kCGEventOtherMouseUp);
        CFMachPortRef tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap, kCGEventTapOptionDefault, mask, inputCallback, NULL);
        if (!tap) {
            @synchronized(inputLock) { inputRunning = NO; inputError = @"macOS refused the event tap. Allow Rabta under System Settings → Privacy & Security → Accessibility (and Input Monitoring), then start the input service again."; }
            dispatch_semaphore_signal(inputStarted);
            return;
        }
        CFRunLoopSourceRef source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
        CFRunLoopTimerRef timer = CFRunLoopTimerCreate(kCFAllocatorDefault, CFAbsoluteTimeGetCurrent() + 0.1, 0.08, 0, 0, focusTimerFired, NULL);
        CFRunLoopRef loop = CFRunLoopGetCurrent();
        CFRunLoopAddSource(loop, source, kCFRunLoopCommonModes);
        CFRunLoopAddTimer(loop, timer, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
        @synchronized(inputLock) { inputTap = tap; inputSource = source; inputTimer = timer; inputRunLoop = loop; inputRunning = YES; inputError = nil; }
        dispatch_semaphore_signal(inputStarted);
        CFRunLoopRun();
        @synchronized(inputLock) { inputTap = NULL; inputSource = NULL; inputTimer = NULL; inputRunLoop = NULL; inputRunning = NO; }
        CGEventTapEnable(tap, false);
        CFRunLoopRemoveSource(loop, source, kCFRunLoopCommonModes);
        CFRunLoopTimerInvalidate(timer);
        CFRelease(timer);
        CFMachPortInvalidate(tap);
        CFRelease(source);
        CFRelease(tap);
        if (inputStopped) dispatch_semaphore_signal(inputStopped);
    }
}
@end
static NSDictionary *inputStatus(void) {
    NSMutableDictionary *result = NSMutableDictionary.dictionary;
    @synchronized(inputLock) {
        result[@"running"] = @(inputRunning);
        result[@"error"] = emptyValue(inputError);
        result[@"cleaning"] = @(inputFlags.cleaning);
        result[@"expansions"] = @(inputExpansions);
        result[@"lastEvent"] = emptyValue(inputLastEvent);
        inputLastEvent = nil;
    }
    result[@"accessibilityTrusted"] = @(AXIsProcessTrusted());
    result[@"inputMonitoring"] = @(CGPreflightListenEventAccess());
    return result;
}
static NSDictionary *inputRequestAccess(void) {
    NSDictionary *options = @{ (__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES };
    BOOL trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
    BOOL listen = CGRequestListenEventAccess();
    return @{ @"accessibilityTrusted": @(trusted), @"inputMonitoring": @(listen) };
}
static BOOL inputStop(void) {
    CFRunLoopRef loop = NULL;
    @synchronized(inputLock) { loop = inputRunLoop; if (!inputRunning) return YES; }
    if (!loop) return YES;
    CFRunLoopStop(loop);
    return dispatch_semaphore_wait(inputStopped, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC)) == 0;
}
/// Applies a complete configuration. The Rust side validates ranges and
/// shapes; this only converts and starts or stops the tap thread.
static NSDictionary *inputConfigure(NSDictionary *request) {
    if (!inputLock) inputLock = NSObject.new;
    NSDictionary *scroll = request[@"scroll"], *click = request[@"clickDebounce"], *key = request[@"keyDebounce"], *quit = request[@"quitProtection"], *focus = request[@"focusFollowsMouse"];
    InputFlags flags = {0};
    flags.invertVertical = [scroll[@"invertVertical"] boolValue];
    flags.invertHorizontal = [scroll[@"invertHorizontal"] boolValue];
    flags.clickDebounce = [click[@"enabled"] boolValue];
    flags.clickDebounceSeconds = MIN(MAX([click[@"milliseconds"] doubleValue], 5), 500) / 1000.0;
    flags.keyDebounce = [key[@"enabled"] boolValue];
    flags.keyDebounceSeconds = MIN(MAX([key[@"milliseconds"] doubleValue], 5), 500) / 1000.0;
    flags.quitProtection = [quit[@"enabled"] boolValue];
    flags.quitHold = [quit[@"mode"] isEqual:@"hold"];
    flags.quitHoldSeconds = MIN(MAX([quit[@"holdMilliseconds"] doubleValue], 500), 5000) / 1000.0;
    flags.protectClose = [quit[@"includeCloseWindow"] boolValue];
    flags.pastePlain = [request[@"pastePlain"][@"enabled"] boolValue];
    flags.cleaning = [request[@"cleaningMode"][@"enabled"] boolValue];
    flags.focusFollowsMouse = [focus[@"enabled"] boolValue];
    flags.focusDelaySeconds = MIN(MAX([focus[@"delayMilliseconds"] doubleValue], 100), 5000) / 1000.0;
    NSMutableArray *buttons = NSMutableArray.array;
    for (NSDictionary *mapping in [request[@"mouseButtons"] isKindOfClass:NSArray.class] ? request[@"mouseButtons"] : @[]) {
        if (![mapping isKindOfClass:NSDictionary.class]) continue;
        int64_t button = [mapping[@"button"] longLongValue];
        if (button < 2 || button >= 32 || buttons.count >= 32) continue;
        [buttons addObject:@{ @"button": @(button), @"keyCode": @([mapping[@"keyCode"] intValue] & 0xFFFF), @"flags": @([mapping[@"flags"] unsignedLongLongValue]) }];
    }
    NSMutableArray *snippets = NSMutableArray.array;
    for (NSDictionary *snippet in [request[@"snippets"] isKindOfClass:NSArray.class] ? request[@"snippets"] : @[]) {
        NSString *trigger = stringValue(snippet[@"trigger"], 32), *text = stringValue(snippet[@"text"], 20000);
        if (!trigger || !text || trigger.length < 2 || snippets.count >= 200) continue;
        [snippets addObject:@{ @"trigger": trigger, @"text": text }];
    }
    NSMutableSet *excluded = NSMutableSet.set, *quitExcluded = NSMutableSet.set;
    for (id item in [request[@"excludedApps"] isKindOfClass:NSArray.class] ? request[@"excludedApps"] : @[]) { NSString *bundle = stringValue(item, 255); if (bundle) [excluded addObject:bundle.lowercaseString]; }
    for (id item in [quit[@"excludedApps"] isKindOfClass:NSArray.class] ? quit[@"excludedApps"] : @[]) { NSString *bundle = stringValue(item, 255); if (bundle) [quitExcluded addObject:bundle.lowercaseString]; }
    BOOL anything = flags.invertVertical || flags.invertHorizontal || flags.clickDebounce || flags.keyDebounce || flags.quitProtection || flags.pastePlain || flags.cleaning || flags.focusFollowsMouse || buttons.count || snippets.count;
    @synchronized(inputLock) {
        inputFlags = flags;
        inputButtons = buttons;
        inputSnippets = snippets;
        inputExcluded = excluded;
        inputQuitExcluded = quitExcluded;
        if (!anything) inputError = nil;
    }
    if (!anything) { inputStop(); return inputStatus(); }
    BOOL running;
    @synchronized(inputLock) { running = inputRunning; }
    if (!running) {
        if (!AXIsProcessTrusted()) {
            @synchronized(inputLock) { inputError = @"Rabta needs Accessibility access to filter input. Allow it under System Settings → Privacy & Security → Accessibility, then try again."; }
            return inputStatus();
        }
        memset(lastMouseDown, 0, sizeof(lastMouseDown));
        memset(swallowMouseUp, 0, sizeof(swallowMouseUp));
        memset(lastKeyDown, 0, sizeof(lastKeyDown));
        quitTapTime = 0; quitHoldStart = 0; quitTapKey = -1; escapeCount = 0; lastMoveTime = 0; focusHandled = YES; typedBuffer = nil;
        inputStarted = dispatch_semaphore_create(0);
        inputStopped = dispatch_semaphore_create(0);
        [NSThread detachNewThreadSelector:@selector(run:) toTarget:RabtaInputService.class withObject:nil];
        dispatch_semaphore_wait(inputStarted, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));
    }
    return inputStatus();
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

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
            else if ([op isEqual:@"openPanel"]) result = openPanel(request);
            else if ([op isEqual:@"trashItems"]) result = trashItems(request);
            else if ([op isEqual:@"displays"]) result = displays();
            else if ([op isEqual:@"runningApps"]) result = runningApplications(request);
            else if ([op isEqual:@"terminateApp"]) result = terminateApplication(request);
            else if ([op isEqual:@"launchApp"]) result = launchApplication(request);
            else if ([op isEqual:@"installedApps"]) result = installedApplications(request);
            else if ([op isEqual:@"cameraDevices"]) result = cameraDevices();
            else if ([op isEqual:@"cameraStart"]) result = cameraStart(request);
            else if ([op isEqual:@"cameraStop"]) result = cameraStop();
            else if ([op isEqual:@"inputStatus"]) { if (!inputLock) inputLock = NSObject.new; result = inputStatus(); }
            else if ([op isEqual:@"inputRequestAccess"]) result = inputRequestAccess();
            else if ([op isEqual:@"inputConfigure"]) result = inputConfigure(request);
            else if ([op isEqual:@"inputStop"]) { if (!inputLock) inputLock = NSObject.new; result = inputStop() ? inputStatus() : failure(@"The input service did not stop in time."); }
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
