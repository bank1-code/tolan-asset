from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from pypdf import PdfReader

target=Path('output/pdf/qa-inventory-review.pdf')
target.parent.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
story=[Paragraph('QA INVENTORY REVIEW MEMO',styles['Title']),Spacer(1,18),
 Paragraph('TEST DATA ONLY - NOT A REAL BUSINESS DOCUMENT',styles['Heading2']),Spacer(1,16)]
rows=[['Reference','QA-DIFF-REVIEW-20261011'],['Inventory session','180001'],['Item code','CST-TBK-102614'],['Expected quantity','10'],['Original counted quantity','9'],['Original difference','-1'],['Workflow test','Documented review, then reopen'],['Test environment date','11 October 2026']]
t=Table(rows,colWidths=[180,310]);t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),0.5,colors.HexColor('#CBD5E1')),('BACKGROUND',(0,0),(0,-1),colors.HexColor('#EEF6F4')),('FONTNAME',(0,0),(-1,-1),'Helvetica'),('FONTSIZE',(0,0),(-1,-1),10),('LEFTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]));story.extend([t,Spacer(1,22),Paragraph('Purpose',styles['Heading2']),Paragraph('This fictional memo exercises the requirement for evidence before closing an inventory difference. The review and reopening must retain the original approved count, reason, previous actions and actor timestamps. No inventory quantity, asset cost or depreciation balance is changed by this test.',styles['BodyText']),Spacer(1,15),Paragraph('Acceptance check',styles['Heading2']),Paragraph('The manager records a review covering one unit, then reopens that same unit. The shortage remains available for subsequent operational handling. The original result stays 9 against 10 throughout.',styles['BodyText'])])
SimpleDocTemplate(str(target),pagesize=A4,rightMargin=42,leftMargin=42,topMargin=46,bottomMargin=46).build(story)
r=PdfReader(target);assert len(r.pages)==1 and 'CST-TBK-102614' in r.pages[0].extract_text();print(f'{target}: 1 page, text verified')
