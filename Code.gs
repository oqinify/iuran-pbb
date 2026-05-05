/**
 * Iuran Kantor Management System
 * Backend: Google Apps Script
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const SHEETS = {
  MEMBERS: 'Members',
  TRANSACTIONS: 'Transactions',
  EXPENSES: 'Expenses'
};

const DRIVE_FOLDER_NAME = "Iuran_Attachments";

function doGet(e) {
  if (e.parameter.action) return handleApiRequest(e);
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('Iuran Ku')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  return handleApiRequest(e);
}

function handleApiRequest(e) {
  let action, params;
  
  if (e.postData) {
    const postBody = JSON.parse(e.postData.contents);
    action = postBody.action;
    params = postBody.data;
  } else {
    action = e.parameter.action;
    params = e.parameter;
  }

  let response;
  try {
    switch (action) {
      case 'getDashboardData': response = getDashboardData(); break;
      case 'getMembers': response = getMembers(); break;
      case 'getTransactions': response = getTransactions(); break;
      case 'getExpenses': response = getExpenses(); break;
      case 'addTransaction': response = addTransaction(params); break;
      case 'addExpense': response = addExpense(params); break;
      case 'addMember': response = addMember(params); break;
      case 'uploadFile': response = uploadFile(params); break;
      default: response = { error: 'Action not found' };
    }
  } catch (err) {
    response = { error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function initSheets() {
  const sheets = SS.getSheets().map(s => s.getName());
  
  if (!sheets.includes(SHEETS.MEMBERS)) {
    const s = SS.insertSheet(SHEETS.MEMBERS);
    s.appendRow(['ID', 'Name', 'Department', 'TotalQuota', 'UsedAmount', 'Balance']);
  }
  
  if (!sheets.includes(SHEETS.TRANSACTIONS)) {
    const s = SS.insertSheet(SHEETS.TRANSACTIONS);
    s.appendRow(['ID', 'MemberID', 'Date', 'Amount', 'Description', 'Attachment', 'Timestamp']);
  }

  if (!sheets.includes(SHEETS.EXPENSES)) {
    const s = SS.insertSheet(SHEETS.EXPENSES);
    s.appendRow(['ID', 'Date', 'Amount', 'Description', 'Attachment', 'Timestamp']);
  }
  
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (!folders.hasNext()) DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function uploadFile(data) {
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
  
  const contentType = data.base64.split(',')[0].split(':')[1].split(';')[0];
  const bytes = Utilities.base64Decode(data.base64.split(',')[1]);
  const blob = Utilities.newBlob(bytes, contentType, data.name);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return { success: true, url: file.getUrl() };
}

function getMembers() {
  const sheet = SS.getSheetByName(SHEETS.MEMBERS);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getDashboardData() {
  const members = getMembers();
  const txs = getTransactions();
  const exps = getExpenses();
  
  const totalQuota = members.reduce((sum, m) => sum + (Number(m.TotalQuota) || 0), 0);
  const totalUsed = txs.reduce((sum, t) => sum + (Number(t.Amount) || 0), 0);
  const totalExpense = exps.reduce((sum, e) => sum + (Number(e.Amount) || 0), 0);
  
  return {
    stats: {
      totalMembers: members.length,
      totalQuota: totalQuota,
      totalUsed: totalUsed,
      totalExpense: totalExpense,
      netBalance: totalUsed - totalExpense,
      totalBalance: totalQuota - totalUsed
    },
    recentTransactions: txs.slice(-5).reverse(),
    recentExpenses: exps.slice(-5).reverse()
  };
}

function getTransactions() {
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function getExpenses() {
  const sheet = SS.getSheetByName(SHEETS.EXPENSES);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function addTransaction(p) {
  const sheetTx = SS.getSheetByName(SHEETS.TRANSACTIONS);
  const sheetMem = SS.getSheetByName(SHEETS.MEMBERS);
  const id = 'TX-' + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
  
  sheetTx.appendRow([id, p.memberId, p.date, p.amount, p.description, p.attachmentUrl || '', new Date()]);
  
  const memData = sheetMem.getDataRange().getValues();
  const headers = memData[0];
  const idCol = headers.indexOf('ID');
  const usedCol = headers.indexOf('UsedAmount');
  const balCol = headers.indexOf('Balance');
  
  for (let i = 1; i < memData.length; i++) {
    if (memData[i][idCol] == p.memberId) {
      const qCol = headers.indexOf('TotalQuota');
      const curUsed = Number(memData[i][usedCol]) || 0;
      const q = Number(memData[i][qCol]) || 0;
      const newUsed = curUsed + Number(p.amount);
      sheetMem.getRange(i + 1, usedCol + 1).setValue(newUsed);
      sheetMem.getRange(i + 1, balCol + 1).setValue(q - newUsed);
      break;
    }
  }
  return { success: true, message: 'Berhasil' };
}

function addExpense(p) {
  const sheet = SS.getSheetByName(SHEETS.EXPENSES);
  const id = 'EXP-' + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
  sheet.appendRow([id, p.date, p.amount, p.description, p.attachmentUrl || '', new Date()]);
  return { success: true, message: 'Berhasil' };
}

function addMember(p) {
  const sheet = SS.getSheetByName(SHEETS.MEMBERS);
  const id = 'MEM-' + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
  sheet.appendRow([id, p.name, p.department, p.quota, 0, p.quota]);
  return { success: true, id: id };
}
