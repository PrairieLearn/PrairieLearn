#!/bin/bash
set -ex

apk update
apk upgrade

# Notes:
# - `gcc-c++` is needed to build the native bindings in `packages/bind-mount`
# - `libjpeg` is needed by the Pillow package
# - `libffi-dev` is needed by `rpy2`
# - `procps-ng` is needed for the `pkill` executable, which is used by `zygote.py`
# - `texlive` and `texlive-dvipng` are needed for matplotlib LaTeX labels
apk add \
  curl \
  gcc \
  g++ \
  git \
  graphviz \
  imagemagick \
  libc6-compat \
  libjpeg \
  libffi-dev \
  lsof \
  make \
  npm \
  nodejs \
  openssl \
  postgresql14 \
  procps \
  python3 \
  python3-dev \
  py3-matplotlib \
  py3-numpy \
  py3-pandas \
  py3-pip \
  py3-pygraphviz \
  py3-scikit-learn \
  py3-statsmodels \
  R \
  redis \
  tar \
  tmux

# PrairieLearn doesn't currently use `npm` itself, but we can't be sure that
# someone else isn't using our base image and relying on `npm`, so we'll
# continue to install it to avoid breaking things.
npm install npm@latest -g
npm install yarn@latest -g

echo "setting up postgres..."
mkdir /var/postgres && chown postgres:postgres /var/postgres
mkdir /run/postgresql && chown postgres:postgres /run/postgresql
su postgres -c "initdb -D /var/postgres"

# echo "setting up conda..."
# cd /
# arch=`uname -m`
# curl -LO https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-${arch}.sh
# bash Miniforge3-Linux-${arch}.sh -b -p /usr/local -f


python3 -m pip install --no-cache-dir -r /python-requirements.txt

# # If R package installation is specifically disabled, we'll avoid installing anything R-related.
# if [[ "${SKIP_R_PACKAGES}" != "yes" ]]; then
#   echo "installing R..."
#   conda install --channel r r-base r-essentials

#   echo "installing Python packages..."
#   python3 -m pip install --no-cache-dir -r /python-requirements.txt
# else
#   echo "R package installation is disabled"
#   sed '/rpy2/d' /python-requirements.txt > /py_req_no_r.txt # Remove rpy2 package.
#   echo "installing Python packages..."
#   python3 -m pip install --no-cache-dir -r /py_req_no_r.txt
# fi

# Clear various caches to minimize the final image size.
# dnf clean all
# conda clean --all
# nvm cache clear
# rm Miniforge3-Linux-${arch}.sh
