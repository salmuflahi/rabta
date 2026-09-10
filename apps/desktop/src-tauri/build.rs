fn main() {
    println!("cargo:rerun-if-changed=src/native-toolkit.m");
    // A macOS target built on a Mac compiles and links the Objective-C service.
    // `cargo check --target aarch64-apple-darwin` from another host type-checks
    // the Rust side only; it cannot produce the native archive, so it must not
    // be mistaken for a Mac build. A Mac without Xcode tools still fails loudly.
    let host_is_mac = std::env::consts::OS == "macos";
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") && !host_is_mac {
        println!("cargo:warning=native-toolkit.m is only compiled on a macOS host; this check does not link the Mac native service");
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") && host_is_mac {
        let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR"));
        let object = out.join("native-toolkit.o");
        let archive = out.join("librabta_native_toolkit.a");
        let architecture = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
            Ok("aarch64") => "arm64",
            Ok("x86_64") => "x86_64",
            _ => panic!("Unsupported macOS architecture"),
        };
        let compile = std::process::Command::new("xcrun")
            .args(["--sdk", "macosx", "clang", "-fobjc-arc", "-fmodules", "-O2", "-Wall", "-Wextra", "-mmacosx-version-min=11.0", "-arch", architecture, "-c", "src/native-toolkit.m", "-o"])
            .arg(&object)
            .status().expect("Xcode command-line tools are required to build the Mac native toolkit");
        assert!(compile.success(), "Mac native toolkit compilation failed");
        let package = std::process::Command::new("xcrun")
            .args(["ar", "rcs"]).arg(&archive).arg(&object)
            .status().expect("Could not archive the Mac native toolkit");
        assert!(package.success(), "Mac native toolkit archive failed");
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=rabta_native_toolkit");
        for framework in ["AppKit", "Foundation", "Vision", "CoreAudio", "IOKit", "ApplicationServices", "CoreGraphics", "QuartzCore", "AVFoundation", "UniformTypeIdentifiers"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
    tauri_build::build()
}
