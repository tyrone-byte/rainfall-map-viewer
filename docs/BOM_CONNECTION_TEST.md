# Check BoM FTP access before buying collection services

Deploy the current `main` commit to the existing free Render web service. No
database, paid job, SSH access or new environment variables are needed.

1. In the existing Render web service, use **Manual Deploy → Deploy latest commit**.
2. Wait for the deployment to become Live.
3. Open <https://rainfall-map-viewer.onrender.com/diagnostics/bom>.
4. Click **Run connection test**. Wait for a completed result, usually under a minute.
5. Share a screenshot or expand **Result to share** and copy the metadata.

The page must say **Running on Render: Yes**. Local automated tests use synthetic
fixtures to verify behavior and do not establish actual Render connectivity.

The background test lists `ftp://ftp.bom.gov.au/anon/gen/fwo/` once, selects only
the newest `IDQ65900_<14 digits>.hcs` filename, downloads at most one file, and
validates BoM-HCS 2.0 rainfall measurements with a 900-second duration parameter.
There are no retries or user-selected remote URLs. Each request has a 20-second
curl limit and a 25-second subprocess limit. Listing/file limits are 4/20 MB.
Neither downloaded observation rows nor stderr are published or written to disk.
Only bounded diagnostic metadata is saved in `.cache/bom-connection-test.json`.

GET requests only read the saved result. An explicit same-origin POST starts the
test. A lock prevents simultaneous starts; completed results are reused within a
process and across restarts when the cache survives. The normal dashboard never
starts this test. A new deployment commit resets a retained diagnostic result;
ephemeral filesystem loss may also reset it. This is not a globally durable quota.

A pass establishes FTP directory access, a passive FTP file transfer and one
file's supported rainfall format from this **web service**. It does not prove
network access from another service, scheduling, database writes, backups,
station matching, source freshness or observation quality. File-format failure
after a completed download is distinguished from a connection failure.

The connection check is a setup aid, not an operational status indicator. Remove
its routes, page and module once the hosting decision and tests are complete.
The existing free web service may briefly restart or sleep during deployment;
do not create another service or purchase resources to run this diagnostic.
