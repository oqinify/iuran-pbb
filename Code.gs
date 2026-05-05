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

function doGet(e) {
  // Check if it's an API call
  if (e.parameter.action) {
    return handleApiRequest(e);
  }
  
  // Otherwise serve the HTML page
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Iuran Kantor - Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * API Handler for external requests (GitHub Pages, etc.)
 */
function handleApiRequest(e) {
  const action = e.parameter.action;
  let response;
  
  try {
    switch (action) {
      case 'getDashboardData':
        response = getDashboardData();
        break;
      case 'getMembers':
        response = getMembers();
        break;
      case 'getTransactions':
        response = getTransactions();
        break;
      case 'getExpenses':
        response = getExpenses();
        break;
      case 'addTransaction':
        // For GET-based writes (GitHub Pages compat)
        response = addTransaction(e.parameter);
        break;
      case 'addExpense':
        response = addExpense(e.parameter);
        break;
      case 'addMember':
        response = addMember(e.parameter);
        break;
      default:
        response = { error: 'Action not found' };
    }
  } catch (err) {
    response = { error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Initialize Sheets if they don't exist
 */
function initSheets() {
  const sheets = SS.getSheets().map(s => s.getName());
  
  if (!sheets.includes(SHEETS.MEMBERS)) {
    const s = SS.insertSheet(SHEETS.MEMBERS);
    s.appendRow(['ID', 'Name', 'Department', 'TotalQuota', 'UsedAmount', 'Balance']);
    s.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3f3f3');
  }
  
  if (!sheets.includes(SHEETS.TRANSACTIONS)) {
    const s = SS.insertSheet(SHEETS.TRANSACTIONS);
    s.appendRow(['ID', 'MemberID', 'Date', 'Amount', 'Description', 'Timestamp']);
    s.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3f3f3');
  }

  if (!sheets.includes(SHEETS.EXPENSES)) {
    const s = SS.insertSheet(SHEETS.EXPENSES);
    s.appendRow(['ID', 'Date', 'Amount', 'Category', 'Description', 'Timestamp']);
    s.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f3f3f3');
  }
}

/**
 * Fetch all members with their quota status
 */
function getMembers() {
  const sheet = SS.getSheetByName(SHEETS.MEMBERS);
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  return data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
}

/**
 * Fetch dashboard statistics
 */
function getDashboardData() {
  const members = getMembers();
  const transactions = getTransactions();
  const expenses = getExpenses();
  
  const totalQuota = members.reduce((sum, m) => sum + (Number(m.TotalQuota) || 0), 0);
  const totalUsed = members.reduce((sum, m) => sum + (Number(m.UsedAmount) || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.Amount) || 0), 0);
  const totalBalance = totalQuota - totalUsed;
  
  return {
    stats: {
      totalMembers: members.length,
      totalQuota: totalQuota,
      totalUsed: totalUsed,
      totalExpense: totalExpense,
      netBalance: totalUsed - totalExpense,
      totalBalance: totalBalance,
      usagePercentage: totalQuota > 0 ? (totalUsed / totalQuota * 100).toFixed(1) : 0
    },
    recentTransactions: transactions.slice(-5).reverse(),
    recentExpenses: expenses.slice(-5).reverse()
  };
}

/**
 * Fetch all transactions
 */
function getTransactions() {
  const sheet = SS.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  return data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
}

/**
 * Add a new transaction and update member balance
 */
function addTransaction(formData) {
  const sheetTx = SS.getSheetByName(SHEETS.TRANSACTIONS);
  const sheetMem = SS.getSheetByName(SHEETS.MEMBERS);
  
  const id = 'TX-' + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
  const timestamp = new Date();
  
  // 1. Add Transaction
  sheetTx.appendRow([
    id,
    formData.memberId,
    formData.date,
    formData.amount,
    formData.description,
    timestamp
  ]);
  
  // 2. Update Member
  const memData = sheetMem.getDataRange().getValues();
  const headers = memData[0];
  const idCol = headers.indexOf('ID');
  const usedCol = headers.indexOf('UsedAmount');
  const balCol = headers.indexOf('Balance');
  
  for (let i = 1; i < memData.length; i++) {
    if (memData[i][idCol] == formData.memberId) {
      const currentUsed = Number(memData[i][usedCol]) || 0;
      const totalQuota = Number(memData[i][headers.indexOf('TotalQuota')]) || 0;
      const newUsed = currentUsed + Number(formData.amount);
      const newBalance = totalQuota - newUsed;
      
      sheetMem.getRange(i + 1, usedCol + 1).setValue(newUsed);
      sheetMem.getRange(i + 1, balCol + 1).setValue(newBalance);
      break;
    }
  }
  
  return { success: true, message: 'Transaksi berhasil ditambahkan' };
}

/**
 * Register new member
 */
function addMember(formData) {
  const sheet = SS.getSheetByName(SHEETS.MEMBERS);
  const id = 'MEM-' + Utilities.formatDate(new Date(), "GMT+7", "HHmmss");
  
  sheet.appendRow([
    id,
    formData.name,
    formData.department,
    formData.quota,
    0, // Used
    formData.quota // Balance
  ]);
  
  return { success: true, id: id };
}

/**
 * Fetch all expenses
 */
function getExpenses() {
  const sheet = SS.getSheetByName(SHEETS.EXPENSES);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  
  return data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
}

/**
 * Add a new office expense
 */
function addExpense(formData) {
  const sheet = SS.getSheetByName(SHEETS.EXPENSES);
  const id = 'EXP-' + Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd-HHmmss");
  const timestamp = new Date();
  
  sheet.appendRow([
    id,
    formData.date,
    formData.amount,
    formData.category,
    formData.description,
    timestamp
  ]);
  
  return { success: true, message: 'Belanja berhasil dicatat' };
}
