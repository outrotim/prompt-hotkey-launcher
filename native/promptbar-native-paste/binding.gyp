{
  "targets": [
    {
      "target_name": "promptbar_native_paste",
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS==\"mac\"", {
          "sources": ["src/addon.mm"],
          "cflags_cc": ["-std=c++17"],
          "libraries": ["-framework ApplicationServices"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          }
        }],
        ["OS==\"win\"", {
          "sources": ["src/addon_win.cc"],
          "defines": ["NOMINMAX", "WIN32_LEAN_AND_MEAN"],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
