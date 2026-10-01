//! `--features bundle` (the downloadable build, docs/RELEASE.md): point the binary at the game data it embeds
//! ($ARENA_DATA_PAK, else ../release/arena-data.pak from `npm run release:data`) and, on Windows, embed the app icon
//! (assets/icon.ico) and version info. A plain build does neither.
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=ARENA_DATA_PAK");
    if std::env::var_os("CARGO_FEATURE_BUNDLE").is_none() {
        return;
    }
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let pak = std::env::var_os("ARENA_DATA_PAK").map(PathBuf::from).unwrap_or_else(|| manifest.join("..").join("release").join("arena-data.pak"));
    let pak = pak.canonicalize().unwrap_or_else(|_| panic!("no game data at {}: run `npm run build` and `npm run release:data` first (or set ARENA_DATA_PAK)", pak.display()));
    println!("cargo:rerun-if-changed={}", pak.display());
    println!("cargo:rustc-env=ARENA_DATA_PAK={}", pak.display());
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rerun-if-changed=assets/icon.ico");
        let v = std::env::var("CARGO_PKG_VERSION").unwrap();
        let mut n: Vec<u32> = v.split(['.', '-']).take(3).map(|x| x.parse().unwrap_or(0)).collect();
        n.resize(4, 0);
        let nums = n.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
        let icon = manifest.join("assets").join("icon.ico").display().to_string().replace('\\', "/");
        let rc = format!(
            r#"1 ICON "{icon}"
1 VERSIONINFO
FILEVERSION {nums}
PRODUCTVERSION {nums}
FILEOS 0x40004
FILETYPE 0x1
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904B0"
    BEGIN
      VALUE "CompanyName", "pokeshell"
      VALUE "FileDescription", "pokeshell arena"
      VALUE "FileVersion", "{v}"
      VALUE "InternalName", "pokeshell-arena"
      VALUE "OriginalFilename", "pokeshell-arena.exe"
      VALUE "ProductName", "pokeshell arena"
      VALUE "ProductVersion", "{v}"
      VALUE "LegalCopyright", "MIT (code). A fan project: card names, numbers and art belong to their owners."
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x409, 1200
  END
END
"#
        );
        let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("arena.rc");
        std::fs::write(&out, rc).unwrap();
        embed_resource::compile(&out, embed_resource::NONE).manifest_optional().expect("couldn't embed the app icon and version info");
    }
}
