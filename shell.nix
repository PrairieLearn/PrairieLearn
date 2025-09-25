{
  pkgs ? import <nixpkgs> { },
  ...
}:
pkgs.mkShell {
  packages = with pkgs; [
    yarn

    python311
    python311Packages.ruff
    python311Packages.uv
  ];
}
