from pathlib import Path
import json
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
root=Path(__file__).resolve().parents[1]
cases=json.loads((root/'qa-results/ui-full-cycle/lifecycle-cases.json').read_text(encoding='utf-8'))['cases']
output=root/'output/pdf/qa-warranty-claims.pdf'
output.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
story=[Paragraph('TOLAN - WARRANTY TEST CLAIMS',styles['Title']),Paragraph('FICTITIOUS QA DOCUMENT - not a commercial invoice or a real warranty authorization.',styles['Normal']),Spacer(1,18)]
for case in [c for c in cases if c['case'].startswith('WARRANTY')]:
    story.append(Paragraph(case['case'].replace('_',' '),styles['Heading2']))
    fields=[('Test reference',case['case']),('Source record',case['operational']['code']),('Record type',case['fixture']['entityType']),('Quantity',str(case['quantity'])),('Unit reference cost (SAR)',case['fixture']['unitCost']),('Original purchase',case['fixture']['purchaseDate']),('Fault date',case['incidentDate']),('Replacement received',case['effectiveDate']),('Policy',case['policy']),('Original identifiers','; '.join(case['originalUnits'])),('Replacement identifiers','; '.join(case['replacementUnits']))]
    table=Table([[Paragraph(a,styles['Normal']),Paragraph(b,styles['Normal'])] for a,b in fields],colWidths=[155,345])
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(0,-1),colors.HexColor('#E7F3F1')),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#BDD5D1')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story.extend([table,Spacer(1,15)])
SimpleDocTemplate(str(output),pagesize=A4,rightMargin=45,leftMargin=45,topMargin=35,bottomMargin=35).build(story)
print(str(output))
