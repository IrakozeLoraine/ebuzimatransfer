# OSRM data

This directory holds the routing graph that `osrm-routed` serves — the road
network behind ambulance ETAs and map geometry. It is **empty in a fresh
checkout**; everything in it is generated, so nothing but this file is tracked.

## Populating it

From the repository root, on the host that will run the stack:

```bash
./osrm-prepare.sh              # add --stop-ollama if the box is memory-tight
```

That downloads a Rwanda OpenStreetMap extract and runs the three OSRM build
stages (extract → partition → customize), leaving ~400MB of `rwanda-latest.osrm.*`
files here. It takes several minutes and peaks around 700MB of RAM.

Then start the router:

```bash
docker compose up -d osrm
curl "http://localhost:5000/route/v1/driving/30.0588,-1.9441;30.1044,-1.9706?overview=false"
```

A healthy response has `"code":"Ok"` and a non-zero `duration`.

## Why it isn't committed

The build output is large, binary, version-specific to the OSRM image, and fully
reproducible from the upstream extract. Committing it would bloat every clone and
still go stale — the mirrors rebuild their extracts daily.

## Refreshing

Delete `rwanda-latest.osm.pbf` and re-run `./osrm-prepare.sh` to pull current map
data, then `docker compose restart osrm`. The container mounts this directory
read-only, so the rebuild must happen on the host.
