cmake_minimum_required(VERSION 3.19)
project(lmbox_propulsion VERSION 1.0 LANGUAGES Fortran)
add_library(lmbox_propulsion SHARED source/types.f90 source/nozzle.f90 source/injector.f90 source/api.f90)
set_target_properties(lmbox_propulsion PROPERTIES
  Fortran_STANDARD 2008 Fortran_STANDARD_REQUIRED YES
  Fortran_MODULE_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/modules"
  WINDOWS_EXPORT_ALL_SYMBOLS YES
  PREFIX "lib")
if(CMAKE_Fortran_COMPILER_ID STREQUAL "GNU")
  target_compile_options(lmbox_propulsion PRIVATE -Wall -Wextra -Werror -frecursive -fcheck=bounds)
endif()
include(CTest)
if(BUILD_TESTING)
  enable_language(C)
  add_executable(propulsion_abi_test tests/abi.c)
  target_include_directories(propulsion_abi_test PRIVATE include)
  target_link_libraries(propulsion_abi_test PRIVATE lmbox_propulsion)
  add_test(NAME propulsion_c_abi COMMAND propulsion_abi_test)
endif()
