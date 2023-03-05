#!/bin/bash

node ./build.mjs --watch &
(cd testserver && ruby server.rb) &

killwatch() {
  kill %1
  exit 0
}
trap killwatch SIGINT
trap killwatch SIGKILL

npm run dev
