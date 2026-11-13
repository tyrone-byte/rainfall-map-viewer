"""Cached, read-only storm overview. No live BoM or ARR requests."""
import math
import archive_service as archive
import flood_status


def water_summary(minutes=1440):
    extent,start,end=archive.water_window(None,minutes)
    if not end:return {**extent,'stations':[]}
    inventory={g['id']:g for g in archive.water_inventory()}
    def read(db):
        references=flood_status.published_by_station(db)
        identities={'bom:'+sid for sid in inventory}
        rows=archive.water_rows(db,start,end,identities,latest=True)
        eligible={'bom:'+sid for sid in references if sid in inventory}
        rows+=archive.water_rows(db,start,end,eligible)
        grouped={}
        # Keep the last issued version for each observation time, as the map does.
        for row in rows:grouped.setdefault(row['station'].removeprefix('bom:'),{})[row['end_at']]=row
        stations=[]
        for sid,gauge in inventory.items():
            samples=sorted(grouped.get(sid,{}).values(),key=lambda r:archive.date(r['end_at']))
            assessed=[];peak=None
            for row in samples:
                status=flood_status.classify(row['value'],row['datum'],references.get(sid,[]))
                if status['category']=='unknown':continue
                assessed.append(row)
                candidate={**status,'level':row['value'],'datum':row['datum'],'observedAt':row['end_at']}
                category_rank=flood_status.CATEGORIES.index(candidate['category'])
                peak_rank=flood_status.CATEGORIES.index(peak['category']) if peak else -1
                if category_rank>peak_rank or (category_rank==peak_rank and (candidate['level']>=peak['level'] if candidate['datum']==peak['datum'] else archive.date(candidate['observedAt'])>archive.date(peak['observedAt']))):peak=candidate
            latest=samples[-1] if samples else None
            current=flood_status.classify(latest['value'] if latest else None,latest['datum'] if latest else None,references.get(sid,[]))
            stations.append({**gauge,'level':latest['value'] if latest else None,'datum':latest['datum'] if latest else None,
                'observedAt':latest['end_at'] if latest else None,'currentFlood':current,'peakFlood':peak,
                'sampleCount':len(samples) if sid in references else None,'assessedSamples':len(assessed),'references':references.get(sid,[])})
        return {'start':start,'end':end,'minutes':minutes,'stations':stations,'extent':extent}
    return archive.read_archive(f'storm-water:{minutes}:{end}',read)


def summary(minutes=1440):
    if minutes not in (1440,4320,10080):raise ValueError('Choose 24 hours, 3 days or 7 days.')
    rain=archive.rainfall_group_series(None,all_groups=True)
    if minutes==1440:
        # Totals and IFD now share the exact same saved snapshot and query.
        stations=[]
        if rain.get('available') and rain.get('periods'):
            for gauge in rain['stations']:
                values=gauge['values'];valid=[v for v in values if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) and v>=0]
                complete=len(values)==96 and len(valid)==96
                stations.append({**{k:v for k,v in gauge.items() if k!='values'},
                    'depth':sum(valid) if complete else None,'complete':complete,
                    'validBlocks':len(valid),'expectedBlocks':96})
        totals={k:v for k,v in rain.items() if k not in ('stations','periods','periodMinutes')}
        totals.update(stations=stations,minutes=1440)
    else:totals=archive.rainfall_frame(minutes=minutes)
    # Send only display/identity fields, and deduplicate bulletin memberships once.
    keys=('id','stationNumber','name','group','basinId','coordinates','ifdLocationKey')
    def compact(rows,extra):
        unique={}
        for row in rows:unique.setdefault(row.get('stationNumber') or row['id'],{k:row[k] for k in (*keys,*extra) if k in row})
        return list(unique.values())
    rain={**rain,'stations':compact(rain.get('stations',[]),('values',))}
    totals={**totals,'stations':compact(totals.get('stations',[]),('depth','complete','validBlocks','expectedBlocks'))}
    return {'minutes':minutes,'rainfall':totals,'pointRainfall':rain,
            'generatedAt':archive.datetime.now(archive.timezone.utc).isoformat()}
