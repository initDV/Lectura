cmake_minimum_required(VERSION 3.24)
project(LecturaLinux VERSION 1.2.0 LANGUAGES C CXX)

include(CTest)
include(FetchContent)
include(GNUInstallDirs)
find_package(Threads REQUIRED)
find_package(PkgConfig REQUIRED)
pkg_check_modules(SVG REQUIRED IMPORTED_TARGET librsvg-2.0>=2.46 cairo)
find_package(Qt6 6.4 REQUIRED COMPONENTS Widgets Multimedia Concurrent)
find_program(NODE_EXECUTABLE node REQUIRED)

# The interpreter links only its pure ECMAScript core. Do not include quickjs-libc
# (no filesystem, networking, console or system modules), CLI or test runners.
FetchContent_Declare(quickjs
  URL https://codeload.github.com/quickjs-ng/quickjs/tar.gz/d7215b0ad3fc2c562e8317fd9bca058fd4863804 # v0.18.0
  URL_HASH SHA256=a49defe70cbcae9226d9fac025af116e87ebae2440dcff1ca3c80b79e1cdef0b
  SOURCE_SUBDIR no-cmake-project)
FetchContent_MakeAvailable(quickjs)
add_library(lectura-qjs STATIC
  "${quickjs_SOURCE_DIR}/quickjs.c" "${quickjs_SOURCE_DIR}/dtoa.c"
  "${quickjs_SOURCE_DIR}/libregexp.c" "${quickjs_SOURCE_DIR}/libunicode.c")
target_compile_definitions(lectura-qjs PRIVATE _GNU_SOURCE)
target_include_directories(lectura-qjs SYSTEM PUBLIC "${quickjs_SOURCE_DIR}")
target_link_libraries(lectura-qjs PUBLIC Threads::Threads m)
set_target_properties(lectura-qjs PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE YES)

include(voice/onnx-runtime.cmake)
set(ASSETS "${CMAKE_CURRENT_BINARY_DIR}/assets")
get_filename_component(ORT_NAME "${ORT_LIBRARY}" NAME)
add_custom_target(lectura-assets ALL
  COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/assets.mjs" "${ASSETS}"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${CMAKE_CURRENT_SOURCE_DIR}/desktop/theme.qss" "${ASSETS}/theme.qss"
  COMMAND "${CMAKE_COMMAND}" -E make_directory "${ASSETS}/native"
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different "${ORT_CACHE}/${ORT_LIBRARY}" "${ASSETS}/native/${ORT_NAME}"
  BYPRODUCTS "${ASSETS}/motion.js" "${ASSETS}/siwis.js" "${ASSETS}/theme.qss" "${ASSETS}/native/${ORT_NAME}"
  COMMENT "Préparer le catalogue partagé et les animations"
  VERBATIM)

add_library(lectura-core STATIC src/model.cpp src/siwis.cpp src/stage.cpp src/transport.cpp src/video.cpp src/window.cpp)
set_target_properties(lectura-core PROPERTIES AUTOMOC ON POSITION_INDEPENDENT_CODE YES)
target_compile_features(lectura-core PUBLIC cxx_std_17)
target_compile_options(lectura-core PRIVATE -Wall -Wextra -Wformat=2)
target_compile_definitions(lectura-core PUBLIC QT_NO_KEYWORDS PRIVATE LECTURA_ORT_NAME="${ORT_NAME}" LECTURA_LIBDIR="${CMAKE_INSTALL_LIBDIR}")
target_include_directories(lectura-core SYSTEM PRIVATE "${ort_headers_SOURCE_DIR}")
target_include_directories(lectura-core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_link_libraries(lectura-core PUBLIC Qt6::Widgets Qt6::Multimedia Qt6::Concurrent PRIVATE PkgConfig::SVG lectura-qjs)

add_executable(lectura src/main.cpp)
target_compile_definitions(lectura PRIVATE LECTURA_VERSION="${PROJECT_VERSION}" LECTURA_SHARE="${CMAKE_INSTALL_DATADIR}/lectura")
target_link_libraries(lectura PRIVATE lectura-core)
add_dependencies(lectura lectura-assets)

if(BUILD_TESTING)
  find_package(Qt6 REQUIRED COMPONENTS Test)
  add_executable(lectura-tests tests/checks.cpp)
  set_target_properties(lectura-tests PROPERTIES AUTOMOC ON)
  target_compile_definitions(lectura-tests PRIVATE LECTURA_TEST_ASSETS="${ASSETS}")
  target_link_libraries(lectura-tests PRIVATE lectura-core Qt6::Test)
  add_dependencies(lectura-tests lectura-assets)
  add_test(NAME linux-desktop COMMAND lectura-tests)
  set_tests_properties(linux-desktop PROPERTIES TIMEOUT 120)
endif()

install(TARGETS lectura RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}")
install(DIRECTORY "${ASSETS}/" DESTINATION "${CMAKE_INSTALL_DATADIR}/lectura" PATTERN "native" EXCLUDE)
install(FILES "${ORT_CACHE}/${ORT_LIBRARY}" DESTINATION "${CMAKE_INSTALL_LIBDIR}/lectura")
install(FILES "${ORT_CACHE}/onnxruntime/LICENSE" DESTINATION "${CMAKE_INSTALL_DATADIR}/doc/lectura" RENAME ONNX-Runtime-LICENSE.txt)
install(FILES "${ORT_CACHE}/onnxruntime/ThirdPartyNotices.txt" DESTINATION "${CMAKE_INSTALL_DATADIR}/doc/lectura" RENAME ONNX-Runtime-ThirdPartyNotices.txt)
install(FILES voice/Siwis-LICENCE.md DESTINATION "${CMAKE_INSTALL_DATADIR}/doc/lectura")
install(FILES desktop/io.github.initdv.Lectura.desktop DESTINATION "${CMAKE_INSTALL_DATADIR}/applications")
install(FILES desktop/io.github.initdv.Lectura.xml DESTINATION "${CMAKE_INSTALL_DATADIR}/mime/packages")
install(FILES ../icons/192.png DESTINATION "${CMAKE_INSTALL_DATADIR}/icons/hicolor/192x192/apps" RENAME io.github.initdv.Lectura.png)
install(FILES ../LICENSE DESTINATION "${CMAKE_INSTALL_DATADIR}/doc/lectura" RENAME copyright)
install(FILES README.md desktop/QuickJS-NG-LICENSE.txt DESTINATION "${CMAKE_INSTALL_DATADIR}/doc/lectura")
