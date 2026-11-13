"""Compare observations only with published station references in the same datum."""
import gauge_references as refs

CATEGORIES=('below','minor','moderate','major')


def classify(level,datum,references):
    unknown={'category':'unknown','reason':'Published flood thresholds unavailable'}
    if not refs.finite(level):return {**unknown,'reason':'No valid water-level reading'}
    if datum not in ('AHD','LGH'):return {**unknown,'reason':'Observation datum unspecified'}
    compatible=[r for r in references if r.get('kind') in CATEGORIES[1:]
                and refs.datum_compatible(r,datum) and r.get('provisional') is False]
    levels={r['kind']:r['level'] for r in compatible if refs.finite(r.get('level'))}
    undefined={kind for r in compatible for kind in r.get('undefinedKinds',[]) if kind in CATEGORIES[1:]}
    ordered=[levels[k] for k in CATEGORIES[1:] if k in levels]
    if any(b<a for a,b in zip(ordered,ordered[1:])):
        return {**unknown,'reason':'Flood thresholds are inconsistent'}
    for index in range(3,0,-1):
        kind=CATEGORIES[index]
        if kind in levels and level>=levels[kind]:
            if any(higher not in levels and higher not in undefined for higher in CATEGORIES[index+1:]):return unknown
            return {'category':kind,'reason':None}
    if 'minor' in levels and all(k in levels or k in undefined for k in CATEGORIES[1:]):
        return {'category':'below','reason':None}
    return unknown


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
