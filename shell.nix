let
  pkgs = import <nixpkgs> { };
in
pkgs.mkShell {
  packages = with pkgs; [
    (python3.withPackages (
      python-pkgs: with python-pkgs; [
        ruff
      ]
    ))
    yarn
    d2
    nodePackages.prettier
  ];
}
