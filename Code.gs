function doGet(e) {
  var sheetName = e.parameter.shift; 
  var floor = e.parameter.floor; 
  var action = e.parameter.action;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // If stats action is requested
  if (action === 'stats') {
    return ContentService.createTextOutput(JSON.stringify(getStats(ss)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // If product detail proxy action is requested (bypasses CORS & WAF)
  if (action === 'product') {
    var id = e.parameter.id;
    if (!id) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Missing product ID" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var response = UrlFetchApp.fetch("https://api.uzum.uz/api/v2/product/" + id, {
        "muteHttpExceptions": true,
        "headers": {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });
      var responseCode = response.getResponseCode();
      var responseText = response.getContentText();
      
      if (responseCode === 200) {
        return ContentService.createTextOutput(responseText)
          .setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          error: "Uzum API returned status " + responseCode
        })).setMimeType(ContentService.MimeType.JSON);
      }
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  if (!sheetName || !floor) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Параметры shift и floor обязательны" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Лист '" + sheetName + "' не найден" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var data = sheet.getDataRange().getValues();
  var items = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var barcode = String(row[0] || "").trim();
    var location = String(row[1] || "").trim();
    var category = String(row[2] || "").trim();
    var name = String(row[3] || "").trim();
    var qty = String(row[4] || "").trim();
    var status = String(row[5] || "").trim();
    var productId = String(row[10] || "").trim(); // Column K (index 10) Product ID
    
    // Filter by floor and status
    if (location.toUpperCase().indexOf(floor.toUpperCase()) === 0 && (!status || status === "")) {
      items.push({
        rowIndex: i + 1,
        location: location,
        barcode: barcode,
        category: category,
        name: name,
        qty: qty,
        productId: productId
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    items: items
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var sheetName = postData.shift;
    var rowIndex = parseInt(postData.rowIndex);
    var status = postData.status;
    var placementCorrect = postData.placementCorrect;
    var userName = postData.userName;
    var timestamp = postData.timestamp;
    var shiftName = postData.shiftName || postData.shift;
    
    if (!sheetName || !rowIndex) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Параметры shift и rowIndex обязательны" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Лист '" + sheetName + "' не найден" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Write data back to Google Sheet
    sheet.getRange(rowIndex, 6).setValue(status); // Column F (Status)
    sheet.getRange(rowIndex, 7).setValue(placementCorrect); // Column G (Placement Correct)
    sheet.getRange(rowIndex, 8).setValue(userName); // Column H (FIO)
    sheet.getRange(rowIndex, 9).setValue(shiftName); // Column I (Shift)
    sheet.getRange(rowIndex, 10).setValue(timestamp || new Date()); // Column J (Date)
    
    SpreadsheetApp.flush();
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getStats(ss) {
  var sheets = ss.getSheets();
  var stats = {};
  
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName();
    
    // We only care about shift sheets, e.g. containing "смена"
    if (sheetName.toLowerCase().indexOf("смена") === -1) continue;
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[5] || "").trim(); // Column F
      var placementCorrect = String(row[6] || "").trim(); // Column G
      var userName = String(row[7] || "").trim(); // Column H
      var dateStr = String(row[9] || "").trim(); // Column J (Timestamp)
      
      // If status is empty, it means this item has not been audited yet
      if (status === "") continue;
      
      // Parse Date from timestamp
      var formattedDate = "";
      try {
        if (dateStr.indexOf(".") !== -1) {
          var parts = dateStr.split(" ")[0].split(".");
          formattedDate = parts[2] + "-" + parts[1] + "-" + parts[0];
        } else {
          var dateObj = new Date(dateStr);
          if (!isNaN(dateObj.getTime())) {
            var year = dateObj.getFullYear();
            var month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
            var day = ("0" + dateObj.getDate()).slice(-2);
            formattedDate = year + "-" + month + "-" + day;
          }
        }
      } catch (e) {
        continue;
      }
      
      if (!formattedDate) continue;
      
      if (!stats[formattedDate]) {
        stats[formattedDate] = {};
      }
      
      if (!stats[formattedDate][sheetName]) {
        stats[formattedDate][sheetName] = {
          total: 0,
          confirmed: 0,
          missing: 0,
          placementCorrect: 0,
          placementIncorrect: 0,
          users: {}
        };
      }
      
      var sData = stats[formattedDate][sheetName];
      sData.total += 1;
      
      if (status === "Подтвержден") {
        sData.confirmed += 1;
      } else if (status === "Отсутствует") {
        sData.missing += 1;
      }
      
      if (placementCorrect === "Да") {
        sData.placementCorrect += 1;
      } else if (placementCorrect === "Нет") {
        sData.placementIncorrect += 1;
      }
      
      if (userName) {
        if (!sData.users[userName]) {
          sData.users[userName] = 0;
        }
        sData.users[userName] += 1;
      }
    }
  }
  
  return stats;
}
