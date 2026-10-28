"""One-time removal of superseded web water history after a validated FTP start."""
import json
from history_store import now,packed

MARKER='water-ftp-history-v1'

def cutover(store):
    if store.execute('SELECT id FROM event_imports WHERE id=?',(MARKER,)).fetchone():return {'status':'already-switched'}
    sources=list(store.execute("SELECT id,source FROM snapshots WHERE kind IN ('water-summary','water-history')"))
    ftp=[r['id'] for r in sources if r['source'] in ('IDQ65910','IDQ65911')]
    if len(ftp)!=2:raise ValueError('Both FTP products must be validated before clearing old water history.')
    old=[r['id'] for r in sources if r['id'] not in ftp]
    placeholders=','.join('?' for _ in old)
    if store.normalised:
        feeds=list(store.execute('SELECT id,snapshot_id FROM history_feeds'))
        ftp_ids=[r['id'] for r in feeds if r['snapshot_id'] in ftp]
        old_ids=[r['id'] for r in feeds if r['snapshot_id'] in old]
        ftp_where="kind_id=2 AND feed_id IN ("+','.join('?' for _ in ftp_ids)+')' if ftp_ids else '1=0'
        old_where="kind_id=2 AND feed_id IN ("+','.join('?' for _ in old_ids)+')' if old_ids else '1=0'
        before=store.execute('SELECT COUNT(*) AS n FROM history_readings WHERE '+ftp_where+' AND value IS NOT NULL',ftp_ids).fetchone()['n']
        if not before:raise ValueError('No numeric FTP water observations saved; old history preserved.')
        store.execute('DELETE FROM revisions WHERE observation_id IN (SELECT id::text FROM history_readings WHERE '+old_where+')',old_ids)
        removed=store.execute('DELETE FROM history_readings WHERE '+old_where,old_ids).rowcount
        after=store.execute('SELECT COUNT(*) AS n FROM history_readings WHERE '+ftp_where+' AND value IS NOT NULL',ftp_ids).fetchone()['n']
    else:
        ftp_where="kind='water-summary' AND snapshot_id IN (?,?)"
        before=store.execute('SELECT COUNT(*) AS n FROM observations WHERE '+ftp_where+' AND value IS NOT NULL',ftp).fetchone()['n']
        if not before:raise ValueError('No numeric FTP water observations saved; old history preserved.')
        old_where="kind IN ('water-summary','water-history') AND snapshot_id IN ("+placeholders+')' if old else '1=0'
        store.execute('DELETE FROM revisions WHERE observation_id IN (SELECT id FROM observations WHERE '+old_where+')',old)
        removed=store.execute('DELETE FROM observations WHERE '+old_where,old).rowcount
        after=store.execute('SELECT COUNT(*) AS n FROM observations WHERE '+ftp_where+' AND value IS NOT NULL',ftp).fetchone()['n']
    if before!=after:raise ValueError('FTP water preservation check failed.')
    if old:
        store.execute('DELETE FROM revisions WHERE snapshot_id IN ('+placeholders+')',old)
        referenced={r['snapshot_id'] for r in store.execute('SELECT DISTINCT snapshot_id FROM observations')}
        referenced.update(r['snapshot_id'] for r in store.execute('SELECT DISTINCT snapshot_id FROM revisions'))
        for sid in old:
            if sid not in referenced:store.execute('DELETE FROM snapshots WHERE id=?',(sid,))
    store.execute("DELETE FROM source_status WHERE source='water-history'")
    report={'status':'switched','removedWebWaterReadings':removed,'retainedNumericFTPReadings':after,
        'note':'Rainfall and station catalogue retained. No historical water estimates created.'}
    store.execute('INSERT INTO event_imports VALUES(?,?,?)',(MARKER,now(),packed(report)))
    store.db.commit()
    print(json.dumps({'waterFTPCutover':report}),flush=True)
    return report
