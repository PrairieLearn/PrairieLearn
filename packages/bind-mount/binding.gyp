{
  "targets": [
    {
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
      "target_name": "addon",
      "sources": [ "addon.cc" ]
    }
  ]
}
