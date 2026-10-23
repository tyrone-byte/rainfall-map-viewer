"""One-off, explicitly estimated quarter-hours for the preserved October event."""
import json
import math
from datetime import datetime, timedelta

from history_store import now

def date(value):
    return datetime.fromisoformat(value)

IDENTITY = 'uniform-rainfall-2026-10-22-v1'
# End estimates at 08:00 AEST, before the first genuine 08:15 observation.
FIRST = '2026-10-20T20:00:00+00:00'
LAST = '2026-10-21T22:00:00+00:00'

def backfill_event(store):
    previous = store.execute('SELECT report FROM event_imports WHERE id=?', (IDENTITY,)).fetchone()
    if previous:
        return {'status': 'already-imported', 'inserted': 0}
    rows = list(store.execute("""SELECT * FROM observations WHERE kind='rain-3h'
        AND duration_seconds=10800 AND end_at>? AND end_at<=?
        ORDER BY end_at,station""", (FIRST, (date(LAST)+timedelta(hours=3)).isoformat())))
    if not rows:
        return {'status': 'no-saved-event', 'inserted': 0}
    count = 0
    for row in rows:
        value = row['value']
        if not row['station'].startswith('bom:') or not isinstance(value, (int,float)) or not math.isfinite(value) or value<0:
            continue
        for i in range(12):
            end = (date(row['end_at'])-timedelta(minutes=15*i)).isoformat()
            if not FIRST<end<=LAST:
                continue
            existing = store.execute("""SELECT id FROM observations WHERE station=? AND kind='rain-15m'
                AND duration_seconds=900 AND end_at=?""", (row['station'],end)).fetchone()
            if existing:
                continue
            count += store.observation(row['snapshot_id'],row['station'],'rainfall',end,900,
                value/12,'rain-15m',row['issued_at'],quality='ESTIMATED_UNIFORM_3H',
                metadata={'estimated':True,'method':'Uniform division of saved 3-hour depth into 12 quarters',
                    'parentObservation':row['id'],'parentEnd':row['end_at'],'parentDepth':value,
                    'eventBackfill':IDENTITY})
    report={'status':'imported','inserted':count,'firstEnd':FIRST,'lastEnd':LAST}
    store.execute('INSERT INTO event_imports VALUES(?,?,?)',(IDENTITY,now(),json.dumps(report)))
    store.db.commit()
    return report
