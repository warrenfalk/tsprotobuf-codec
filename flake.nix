{
  description = "Node development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = { self, flake-utils, nixpkgs }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let pkgs = import nixpkgs {
          system = system;
          config = {
            allowUnfree = true;
          };
        };
        in {
          devShells = {
            default = pkgs.mkShellNoCC {
              buildInputs = [
                pkgs.nodejs-18_x
                pkgs.yarn
                pkgs.jq
              ];

              shellHook = ''
                export PS1="(DEV) $PS1"
                export HISTFILE=".bash_history"
              '';
            };
          };
        }
      );
}
