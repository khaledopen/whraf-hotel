import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {makeExcel,makePdf} from '../../frontend/src/reservation-export.js';
const rows=[{id:72,name:'=HYPERLINK("https://example.invalid")',email:'client@example.invalid',phone:'+22501020304',arrival:'2099-10-10',departure:'2099-10-12',adults:2,children:1,status:'confirmed'}];
test('Excel : vrai classeur, résultats transmis, téléphone texte et aucune formule client',async()=>{
 const bytes=await makeExcel(rows,'Recherche : client · 1 réservation');
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 const sheet=book.getWorksheet('Réservations');
 assert.equal(sheet.rowCount,5);assert.equal(sheet.getCell('A5').value,72);
 assert.equal(sheet.getCell('B5').value,rows[0].name);assert.equal(sheet.getCell('B5').type,ExcelJS.ValueType.String);
 assert.equal(sheet.getCell('D5').value,rows[0].phone);assert.equal(sheet.getCell('E5').value,'10/10/2099');
 assert.equal(sheet.getCell('I5').value,'Confirmée');
});
test('PDF : fichier paginé avec les réservations et le rappel des filtres',async()=>{
 const bytes=await makePdf(Array.from({length:100},(_,i)=>({...rows[0],id:i+1,name:'Client test '+i})),'Statut : Confirmée');
 const pdf=Buffer.from(bytes).toString('latin1');
 assert.ok(pdf.startsWith('%PDF-'));assert.ok(pdf.includes('Client test 99'));assert.ok((pdf.match(/\/Type \/Page\b/g)||[]).length>1);
});
