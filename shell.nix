let
  pkgs = import <nixpkgs> { };
in
pkgs.mkShell {
  packages = with pkgs; [
    (python312.withPackages (
      python-pkgs: with python-pkgs; [
        ruff
      ]
    ))
    uv
    yarn
    ruff
    prettier
    htmlhint
    eslint
    python310
  ];
}
