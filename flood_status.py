"""Compare observations only with published station references in the same datum."""
import gauge_references as refs

CATEGORIES=('below','minor','moderate','major')


def classify(level,datum,references):
    unknown={'category':'unknown','reason':'Published flood thresholds unavailable'}
    if not refs.finite(level):return {**unknown,'reason':'No valid water-level reading'}
    if datum not in ('AHD','LGH'):return {**unknown,'reason':'Observation datum unspecified'}
    levels={r['kind']:r['level'] for r in references if r.get('kind') in CATEGORIES[1:]
            and r.get('datum')==datum and r.get('provisional') is False and refs.finite(r.get('level'))}
    ordered=[levels[k] for k in CATEGORIES[1:] if k in levels]
    if any(b<=a for a,b in zip(ordered,ordered[1:])):
        return {**unknown,'reason':'Flood thresholds are inconsistent'}
    if not all(k in levels for k in CATEGORIES[1:]):
        # A published major threshold alone can establish a major exceedance.
        if 'major' in levels and level>=levels['major']:return {'category':'major','reason':None}
        return unknown
    category='below'
    for kind in CATEGORIES[1:]:
        if level>=levels[kind]:category=kind
    return {'category':category,'reason':None}


def published_by_station(db):
    """Read portable and database references once for a map/summary request."""
    import json
    import archive_service as archive
    records=json.loads((refs.ROOT/'data/water-reference-levels.json').read_text())['records']
    if archive.has_table(db,'gauge_reference_levels'):
        records+= [json.loads(r['record']) for r in archive.query(db,'SELECT record FROM gauge_reference_levels ORDER BY retrieved_at')]
    latest={}
    for r in sorted(records,key=lambda r:r.get('retrievedAt','')):
        if r.get('damId') or r.get('kind') not in CATEGORIES[1:]:continue
        refs.validate(r);latest[(r['stationId'],r['kind'],r.get('datum'))]=r
    result={}
    for r in latest.values():result.setdefault(r['stationId'],[]).append(r)
    return result
