# Runtime-only activation for the pinned macOS arm64 OpenFOAM v2306 build.
# Source this file; every native dependency is resolved inside this prefix.
export PATH=/usr/bin:/bin:/usr/sbin:/sbin
lmbox_openfoam_entry="${BASH_SOURCE:-${ZSH_NAME:+$0}}"
lmbox_openfoam_root="$(cd "$(dirname "$lmbox_openfoam_entry")/.." && pwd -P)" || return 1

# Do not combine this runtime with a previously activated OpenFOAM installation.
for lmbox_openfoam_variable in $(env | sed -nE 's/^((FOAM|WM)_[A-Za-z0-9_]*)=.*/\1/p'); do
    unset "$lmbox_openfoam_variable"
done
export WM_PROJECT_DIR="$lmbox_openfoam_root"
. "$WM_PROJECT_DIR/etc/prefs.sh"

export WM_PROJECT=OpenFOAM WM_PROJECT_VERSION=v2306 FOAM_API=2306
export WM_ARCH=darwin64 WM_ARCH_OPTION=64 WM_COMPILER_LIB_ARCH=64 WM_OSTYPE=POSIX
export WM_PRECISION_OPTION=DP WM_LABEL_SIZE=32 WM_LABEL_OPTION=Int32 WM_COMPILE_OPTION=Opt
export WM_OPTIONS=darwin64ClangDPInt32Opt FOAM_MPI=openmpi-4.1.8
export WM_THIRD_PARTY_DIR="$WM_PROJECT_DIR/ThirdParty"
export FOAM_APPBIN="$WM_PROJECT_DIR/platforms/$WM_OPTIONS/bin"
export FOAM_LIBBIN="$WM_PROJECT_DIR/platforms/$WM_OPTIONS/lib"
export FOAM_MPI_LIBBIN="$FOAM_LIBBIN/$FOAM_MPI"
export FOAM_USER_APPBIN="$WM_PROJECT_USER_DIR/platforms/$WM_OPTIONS/bin"
export FOAM_USER_LIBBIN="$WM_PROJECT_USER_DIR/platforms/$WM_OPTIONS/lib"
export FOAM_RUN="$WM_PROJECT_USER_DIR/run" FOAM_ETC="$WM_PROJECT_DIR/etc"
export FOAM_CONTROLDICT="$(cat "$FOAM_ETC/controlDict")"
export FOAM_TUTORIALS="$WM_PROJECT_DIR/tutorials"
export MPI_ARCH_PATH="$WM_PROJECT_DIR/mpi" OPAL_PREFIX="$WM_PROJECT_DIR/mpi"
export PATH="$FOAM_APPBIN:$WM_PROJECT_DIR/bin:$MPI_ARCH_PATH/bin:$PATH"
export DYLD_LIBRARY_PATH="$FOAM_LIBBIN:$FOAM_MPI_LIBBIN:$MPI_ARCH_PATH/lib:$FOAM_LIBBIN/dummy"
export FOAM_LD_LIBRARY_PATH="$DYLD_LIBRARY_PATH" LD_LIBRARY_PATH="$DYLD_LIBRARY_PATH"
unset lmbox_openfoam_entry lmbox_openfoam_root lmbox_openfoam_variable
