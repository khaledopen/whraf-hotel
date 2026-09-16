const statuses={pending:'En attente',processing:'En cours',confirmed:'Confirmée',declined:'Refusée',cancelled:'Annulée'};
export const columns=['Numéro','Client','E-mail','Téléphone','Arrivée','Départ','Adultes','Enfants','Statut'];
const date=v=>String(v||'').split('-').reverse().join('/');
export const exportRows=rows=>rows.map(r=>[r.id,r.name,r.email,r.phone,date(r.arrival),date(r.departure),r.adults,r.children,statuses[r.status]||r.status]);
export async function makeExcel(rows,filters){
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook();workbook.creator='Wharf Hôtel';
 const sheet=workbook.addWorksheet('Réservations');
 sheet.addRow(['Wharf Hôtel — Réservations']);sheet.addRow([filters]);sheet.addRow([]);
 sheet.addRow(columns);for(const row of exportRows(rows))sheet.addRow(row);
 sheet.getRow(4).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B3C5D'}};
 sheet.columns.forEach((c,i)=>{c.width=[12,28,36,22,15,15,12,12,20][i];});
 sheet.views=[{state:'frozen',ySplit:4}];sheet.autoFilter={from:'A4',to:'I'+Math.max(4,sheet.rowCount)};
 return workbook.xlsx.writeBuffer();
}
export async function makePdf(rows,filters){
 const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 doc.setFontSize(18);doc.text('Wharf Hôtel — Réservations',14,16);doc.setFontSize(9);
 const description=doc.splitTextToSize(filters,265);doc.text(description,14,24);
 autoTable(doc,{startY:28+description.length*4,head:[columns],body:exportRows(rows),styles:{fontSize:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[11,60,93]},margin:{bottom:16},columnStyles:{2:{cellWidth:54}}});
 const total=doc.getNumberOfPages();for(let p=1;p<=total;p++){doc.setPage(p);doc.setFontSize(8);doc.text(p+' / '+total,280,202,{align:'right'});}
 return doc.output('arraybuffer');
}
export async function downloadReservations(format,rows,filters){
 const data=format==='pdf'?await makePdf(rows,filters):await makeExcel(rows,filters);
 const blob=new Blob([data],{type:format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='reservations-'+new Date().toISOString().slice(0,10)+'.'+(format==='pdf'?'pdf':'xlsx');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
