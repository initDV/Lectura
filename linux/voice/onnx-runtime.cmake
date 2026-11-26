# Use only the CPU C shared library from the published manylinux wheel. Python,
# pybind11, and the rest of the wheel aren't installed or used by Lectura.
set(ORT_VERSION 1.24.3)
if(NOT CMAKE_SYSTEM_PROCESSOR MATCHES "^(x86_64|amd64|AMD64)$")
  message(FATAL_ERROR "Le paquet Lectura Linux avec Siwis cible actuellement les PC amd64.")
endif()

# The API-24 headers are the Microsoft MIT headers mirrored by onnxruntime_go.
# Only headers are used from this source; the actual binary is the Microsoft wheel below.
FetchContent_Declare(ort_headers
  URL https://codeload.github.com/yalue/onnxruntime_go/tar.gz/e25f45b51c9c31f54552d6e06db76f4f292faa0f
  URL_HASH SHA256=0e6083d6ba94b037cdb5525f0ec9ea2a380f4ad245220e87273f496430ad3d7f
  SOURCE_SUBDIR no-cmake-project)
FetchContent_MakeAvailable(ort_headers)

set(ORT_CACHE "${CMAKE_CURRENT_BINARY_DIR}/ort-wheel")
set(ORT_WHEEL "${ORT_CACHE}/onnxruntime-${ORT_VERSION}.whl")
set(ORT_HASH fb56575d7794bf0781156955610c9e651c9504c64d42ec880784b6106244882d)
file(MAKE_DIRECTORY "${ORT_CACHE}")
if(EXISTS "${ORT_WHEEL}")
  file(SHA256 "${ORT_WHEEL}" ort_have)
endif()
if(NOT "${ort_have}" STREQUAL "${ORT_HASH}")
  message(STATUS "Télécharger et vérifier ONNX Runtime CPU ${ORT_VERSION}")
  file(DOWNLOAD
    "https://files.pythonhosted.org/packages/03/4b/f96b46c1866a293ed23ca2cf5e5a63d413ad3a951da60dd877e3c56cbbca/onnxruntime-1.24.3-cp311-cp311-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl"
    "${ORT_WHEEL}.part" EXPECTED_HASH "SHA256=${ORT_HASH}" TLS_VERIFY ON TIMEOUT 120)
  file(RENAME "${ORT_WHEEL}.part" "${ORT_WHEEL}")
endif()
set(ORT_LIBRARY "onnxruntime/capi/libonnxruntime.so.${ORT_VERSION}")
file(ARCHIVE_EXTRACT INPUT "${ORT_WHEEL}" DESTINATION "${ORT_CACHE}"
  PATTERNS "${ORT_LIBRARY}" "onnxruntime/LICENSE" "onnxruntime/ThirdPartyNotices.txt")
