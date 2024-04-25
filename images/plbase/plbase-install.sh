#!/bin/bash
set -ex

dnf update -y

# Notes:
# - `gcc-c++` is needed to build the native bindings in `packages/bind-mount`
# - `libjpeg-devel` is needed by the Pillow package
# - `procps-ng` is needed for the `pkill` executable, which is used by `zygote.py`
# - `texlive` and `texlive-dvipng` are needed for matplotlib LaTeX labels
dnf -y install \
    bash-completion \
    gcc \
    gcc-c++ \
    git \
    graphviz \
    graphviz-devel \
    ImageMagick \
    libjpeg-devel \
    lsof \
    make \
    openssl \
    postgresql15 \
    postgresql15-server \
    postgresql15-contrib \
    procps-ng \
    redis6 \
    tar \
    texlive \
    texlive-dvipng \
    texlive-type1cm \
    tmux

echo "installing node via nvm"
git clone https://github.com/creationix/nvm.git /nvm
cd /nvm
git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $(git rev-list --tags --max-count=1)`
source /nvm/nvm.sh
export NVM_SYMLINK_CURRENT=true
nvm install 20
npm install yarn@latest -g
for f in /nvm/current/bin/* ; do ln -s $f /usr/local/bin/`basename $f` ; done

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
su postgres -c "initdb -D /var/postgres"

echo "setting up conda..."
cd /
arch=`uname -m`
curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${arch}.sh
bash Miniforge3-Linux-${arch}.sh -b -p /usr/local -f

# If R package installation is specifically disabled, we'll avoid installing anything R-related.
if [[ "${SKIP_R_PACKAGES}" != "yes" ]]; then
    echo "installing R..."
    conda install --channel r r-base r-essentials

    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /python-requirements.txt
else
    echo "R package installation is disabled"
    sed '/rpy2/d' /python-requirements.txt > /py_req_no_r.txt # Remove rpy2 package.
    echo "installing Python packages..."
    python3 -m pip install --no-cache-dir -r /py_req_no_r.txt
fi

# `pyarrow` and `rpy2` conflict in a horrible way:
#
# - `pyarrow` will load `/usr/lib64/libstdc++.so.6.0.29`
# - `rpy2` will load `/usr/local/lib/libstdc++.so.6.0.32`
#
# `pyarrow` gets autoloaded by `pandas`, which we in turn load in the zygote.
# If someone then tries to load `rpy2` in question code, it will fail to load
# with the following error:
#
# cannot load library '/usr/local/lib/R/lib/libR.so': /lib64/libstdc++.so.6: version `GLIBCXX_3.4.30' not found
#
# This is because `rpy2` needs a version of `libstdc++` that supports libstd++ 3.4.30,
# but `pyarrow` has already loaded a version of `libstdc++` that only supports up to 3.4.29.
#
# We work around that by setting up a symlink to the newer version of `libstdc++`.
#
# TODO: We can probably undo this change once we're removed R and `rpy2`.
# TODO: We could also probably remove this when Amazon Linux picks up a newer version of the `gcc` suite.
ln -sf /usr/local/lib/libstdc++.so.6 /usr/lib64/libstdc++.so.6

# Clear various caches to minimize the final image size.
dnf clean all
conda clean --all
nvm cache clear
rm Miniforge3-Linux-${arch}.sh
