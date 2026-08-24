function doGet(e) {
  var mode = e.parameter.mode || "proverka";
  var sheetName = e.parameter.shift; 
  var floor = e.parameter.floor; 
  var action = e.parameter.action;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // If stats action is requested
  if (action === 'stats') {
    return ContentService.createTextOutput(JSON.stringify(getStats(ss)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // If gotova stats action is requested
  if (action === 'gotova_stats') {
    return ContentService.createTextOutput(JSON.stringify(getGotovaStats(ss)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // If grafana stats action is requested
  if (action === 'grafana') {
    return ContentService.createTextOutput(JSON.stringify(getGrafanaStats(ss)))
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
  
  var floorUpper = String(floor || "").trim().toUpperCase();
  var isSgt = (floorUpper === "СГТ" || floorUpper === "SGT");
  var targetSheetName = isSgt ? "СГТ" : ((mode === "izlishka") ? "излишка" : sheetName);
  
  if (!targetSheetName || !floor) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Параметры shift/mode и floor обязательны" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var sheet = ss.getSheetByName(targetSheetName);
  if (!sheet) {
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      var sName = sheets[s].getName().trim().toLowerCase();
      if (sName === targetSheetName.toLowerCase() || (isSgt && (sName === "сгт" || sName === "sgt" || sName.indexOf("сгт") !== -1))) {
        sheet = sheets[s];
        break;
      }
    }
  }
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Лист '" + targetSheetName + "' не найден" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var userName = e.parameter.userName || "";
  var lastRow = sheet.getLastRow();
  var data = lastRow > 1 ? sheet.getRange(1, 1, lastRow, 11).getValues() : [];
  var uncompletedItems = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var barcode = String(row[0] || "").trim();
    var location = String(row[1] || "").trim();
    var category = String(row[2] || "").trim();
    var name = String(row[3] || "").trim();
    var qty = String(row[4] || "").trim();
    var status = String(row[5] || "").trim();
    var productId = String(row[10] || "").trim();
    
    // Filter by floor and status (if floor is СГТ, accept any location or location matching СГТ)
    var matchesFloor = isSgt || (location.toUpperCase().indexOf(floor.toUpperCase()) === 0);
    if (matchesFloor && (!status || status === "")) {
      uncompletedItems.push({
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
  
  var totalCount = uncompletedItems.length;
  
  // Distribute/stagger items across workers ONLY for izlishka mode
  // For regular audit mode ("proverka"), maintain strict top-to-bottom spreadsheet row order (1, 2, 3...)
  var orderedItems = [];
  if (mode === "izlishka" && totalCount > 0) {
    function getSectionKey(loc) {
      if (!loc) return "DEFAULT";
      var parts = loc.trim().split(/[-_/\s]+/);
      if (parts.length >= 2) {
        return parts[0] + "-" + parts[1]; // e.g. "M1-A" or "M1-05"
      }
      return loc.length >= 4 ? loc.substring(0, 4) : loc;
    }

    function getUserHash(name) {
      if (!name) return 0;
      var h = 0;
      for (var c = 0; c < name.length; c++) {
        h = ((h << 5) - h) + name.charCodeAt(c);
        h |= 0;
      }
      return Math.abs(h);
    }

    var sectionsMap = {};
    var sectionKeysList = [];

    for (var m = 0; m < uncompletedItems.length; m++) {
      var it = uncompletedItems[m];
      var sKey = getSectionKey(it.location);
      if (!sectionsMap[sKey]) {
        sectionsMap[sKey] = [];
        sectionKeysList.push(sKey);
      }
      sectionsMap[sKey].push(it);
    }

    var uHash = getUserHash(userName);

    if (sectionKeysList.length > 1) {
      var startSecIndex = uHash % sectionKeysList.length;
      for (var s = 0; s < sectionKeysList.length; s++) {
        var targetKey = sectionKeysList[(startSecIndex + s) % sectionKeysList.length];
        var listInSec = sectionsMap[targetKey];
        for (var j = 0; j < listInSec.length; j++) {
          orderedItems.push(listInSec[j]);
        }
      }
    } else {
      var offset = (uHash * 7) % totalCount;
      for (var j = 0; j < totalCount; j++) {
        orderedItems.push(uncompletedItems[(offset + j) % totalCount]);
      }
    }
  } else {
    orderedItems = uncompletedItems;
  }

  var cache = CacheService.getScriptCache();
  var filteredItems = [];
  var limit = 10;
    
    for (var k = 0; k < orderedItems.length; k++) {
      var item = orderedItems[k];
      var lockKey = ("lock_" + targetSheetName + "_" + item.rowIndex).replace(/[^a-zA-Z0-9_]/g, "_");
      var lockUser = cache.get(lockKey);
      
      if (lockUser && lockUser !== userName) {
        // Locked by someone else - skip!
        continue;
      }
      
      // Lock for the current user
      if (userName) {
        cache.put(lockKey, userName, 600); // Lock for 10 minutes to prevent expiration issues
      }
      
      filteredItems.push(item);
      if (filteredItems.length >= limit) {
        break;
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      totalCount: totalCount,
      items: filteredItems
    })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var mode = postData.mode || "proverka";
    var floorParam = postData.floor || "";
    var floorUpper = String(floorParam).trim().toUpperCase();
    var isSgt = (floorUpper === "СГТ" || floorUpper === "SGT" || String(postData.shift).trim().toUpperCase() === "СГТ");
    var sheetName = isSgt ? "СГТ" : ((mode === "izlishka") ? "излишка" : postData.shift);
    var rowIndex = parseInt(postData.rowIndex);
    var status = postData.status;
    var placementCorrect = postData.placementCorrect || "";
    var userName = postData.userName;
    var timestamp = postData.timestamp;
    var shiftName = postData.shiftName || postData.shift;
    
    if (!sheetName || !rowIndex) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Параметры shift/mode и rowIndex обязательны" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      var sheets = ss.getSheets();
      for (var s = 0; s < sheets.length; s++) {
        var sName = sheets[s].getName().trim().toLowerCase();
        if (sName === sheetName.toLowerCase() || (isSgt && (sName === "сгт" || sName === "sgt" || sName.indexOf("сгт") !== -1))) {
          sheet = sheets[s];
          break;
        }
      }
    }
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
    
    // Clear script cache lock for this row
    try {
      var lockKey = ("lock_" + sheetName + "_" + rowIndex).replace(/[^a-zA-Z0-9_]/g, "_");
      CacheService.getScriptCache().remove(lockKey);
    } catch (lockErr) {
      // Ignore cache failures
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getStats(ss, targetMode) {
  var sheets = ss.getSheets();
  var stats = {};
  
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName().trim();
    var sLower = sheetName.toLowerCase();
    
    // Ignore non-shift sheets except we process shift sheets
    if (sLower.indexOf("готова") !== -1 || sLower.indexOf("gotova") !== -1 || sLower.indexOf("отчет") !== -1 || sLower.indexOf("report") !== -1) {
      continue;
    }

    // Fast filter for izlishka mode
    if (targetMode === "izlishka" && sLower.indexOf("излишка") === -1 && sLower.indexOf("izlishka") === -1) {
      continue;
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    
    // Find column indices dynamically
    var statusIdx = headers.indexOf("статус");
    var placementIdx = headers.indexOf("размещение верно");
    var userIdx = headers.indexOf("фио");
    var dateIdx = headers.indexOf("дата");
    if (dateIdx === -1) dateIdx = headers.indexOf("время");
    if (dateIdx === -1) dateIdx = headers.indexOf("timestamp");
    
    var qtyIdx = headers.indexOf("кол-во");
    if (qtyIdx === -1) qtyIdx = headers.indexOf("количество");
    if (qtyIdx === -1) qtyIdx = headers.indexOf("колво");
    if (qtyIdx === -1) qtyIdx = headers.indexOf("кол");
    if (qtyIdx === -1 && (sLower === "излишка" || sLower === "izlishka")) qtyIdx = 2;
    
    // Fallbacks
    if (statusIdx === -1) statusIdx = 5;
    if (placementIdx === -1) placementIdx = 6;
    if (userIdx === -1) userIdx = 7;
    if (dateIdx === -1) dateIdx = 9;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[statusIdx] || "").trim();
      var placementCorrect = String(row[placementIdx] || "").trim();
      var userName = String(row[userIdx] || "").trim();
      var rawDate = row[dateIdx];
      
      var itemQty = 1;
      if (qtyIdx !== -1 && row[qtyIdx] !== undefined && row[qtyIdx] !== "") {
        var parsedQty = parseFloat(String(row[qtyIdx]).replace(",", "."));
        if (!isNaN(parsedQty) && parsedQty > 0) {
          itemQty = parsedQty;
        }
      }
      
      // If status is empty, it means this item has not been audited yet
      if (!status || status === "") continue;
      
      // Parse Date from timestamp flexibly
      var formattedDate = "";
      try {
        if (rawDate instanceof Date) {
          formattedDate = Utilities.formatDate(rawDate, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
        } else if (rawDate) {
          var dateStr = String(rawDate).trim();
          if (dateStr.indexOf(".") !== -1) {
            // e.g. 14.08.2026 or 14.08.2026 11:45:00
            var parts = dateStr.split(" ")[0].split(".");
            if (parts.length === 3) {
              var y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
              var m = ("0" + parts[1]).slice(-2);
              var d = ("0" + parts[0]).slice(-2);
              formattedDate = y + "-" + m + "-" + d;
            }
          } else if (dateStr.indexOf("-") !== -1) {
            // e.g. 2026-08-14 or 2026-08-14 11:45:00 or 2026-08-14T11:45:00
            var datePart = dateStr.split(" ")[0].split("T")[0];
            var parts = datePart.split("-");
            if (parts.length === 3) {
              var y = parts[0];
              var m = ("0" + parts[1]).slice(-2);
              var d = ("0" + parts[2]).slice(-2);
              formattedDate = y + "-" + m + "-" + d;
            }
          } else if (dateStr.indexOf("/") !== -1) {
            // e.g. 14/08/2026 or 2026/08/14
            var parts = dateStr.split(" ")[0].split("/");
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                formattedDate = parts[0] + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[2]).slice(-2);
              } else {
                var y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                var m = ("0" + parts[1]).slice(-2);
                var d = ("0" + parts[0]).slice(-2);
                formattedDate = y + "-" + m + "-" + d;
              }
            }
          } else {
            var dateObj = new Date(dateStr);
            if (!isNaN(dateObj.getTime())) {
              formattedDate = Utilities.formatDate(dateObj, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
            }
          }
        }
      } catch (e) {
        // Ignore date parse errors
      }
      
      // If item has status but timestamp was not in dateIdx column, search all columns in row
      if (!formattedDate) {
        for (var c = row.length - 1; c >= 0; c--) {
          var val = row[c];
          if (!val) continue;
          if (val instanceof Date) {
            try {
              formattedDate = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
              if (formattedDate) break;
            } catch (e) {}
          } else {
            var valStr = String(val).trim();
            if (valStr.match(/^\d{4}-\d{2}-\d{2}/) || valStr.match(/^\d{1,2}\.\d{1,2}\.\d{2,4}/)) {
              var isDot = valStr.indexOf(".") !== -1;
              var parts = valStr.split(" ")[0].split(isDot ? "." : "-");
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  formattedDate = parts[0] + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[2]).slice(-2);
                } else {
                  var y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
                  formattedDate = y + "-" + ("0" + parts[1]).slice(-2) + "-" + ("0" + parts[0]).slice(-2);
                }
                if (formattedDate) break;
              }
            }
          }
        }
      }
      
      // Fallback for Izlishka active scans if no date column present in row
      if (!formattedDate && (sLower === "излишка" || sLower === "izlishka")) {
        var todayObj = new Date();
        formattedDate = Utilities.formatDate(todayObj, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      }
      
      if (!formattedDate) {
        continue;
      }
      
      if (!stats[formattedDate]) {
        stats[formattedDate] = {};
      }
      
      if (!stats[formattedDate][sheetName]) {
        stats[formattedDate][sheetName] = {
          total: 0,
          totalQty: 0,
          confirmed: 0,
          confirmedQty: 0,
          missing: 0,
          missingQty: 0,
          placementCorrect: 0,
          placementIncorrect: 0,
          users: {}
        };
      }
      
      var sData = stats[formattedDate][sheetName];
      sData.total += 1;
      sData.totalQty += itemQty;
      
      var normStatus = status.toLowerCase();
      var isConfirmed = normStatus.indexOf("подтвержд") !== -1 || normStatus.indexOf("собр") !== -1 || normStatus === "да" || normStatus.indexOf("готово") !== -1 || normStatus.indexOf("выполн") !== -1 || normStatus.indexOf("найд") !== -1 || normStatus === "ok";
      var isMissing = normStatus.indexOf("отсут") !== -1 || normStatus.indexOf("нет") !== -1 || normStatus.indexOf("не ") !== -1 || normStatus.indexOf("ненайд") !== -1;

      if (isConfirmed) {
        sData.confirmed += 1;
        sData.confirmedQty += itemQty;
      } else if (isMissing) {
        sData.missing += 1;
        sData.missingQty += itemQty;
      }
      
      var normPlacement = placementCorrect.toLowerCase();
      if (normPlacement === "да" || normPlacement === "yes" || normPlacement === "верно") {
        sData.placementCorrect += 1;
      } else if (normPlacement === "нет" || normPlacement === "no" || normPlacement === "неверно") {
        sData.placementIncorrect += 1;
      }
      
      if (userName) {
        if (!sData.users[userName]) {
          sData.users[userName] = { sku: 0, qty: 0 };
        }
        if (typeof sData.users[userName] === "number") {
          sData.users[userName] = { sku: sData.users[userName], qty: sData.users[userName] };
        }
        sData.users[userName].sku += 1;
        if (isConfirmed) {
          sData.users[userName].qty += itemQty;
        }
      }
    }
  }
  
  return stats;
}

function getGotovaStats(ss) {
  var sheets = ss.getSheets();
  var sheet = null;
  for (var s = 0; s < sheets.length; s++) {
    var sName = sheets[s].getName().trim().toLowerCase();
    if (sName === "готова" || sName === "gotova" || sName === "готово" || sName === "gotovo" || sName === "готовые" || sName === "готовы" || sName === "gotovy" || sName === "ready") {
      sheet = sheets[s];
      break;
    }
  }
  
  if (!sheet) {
    // Return error showing what sheets were found so the user knows what we detected
    var allNames = sheets.map(function(s) { return s.getName(); }).join(", ");
    return { success: false, error: "Лист 'готова' не найден. Доступные листы: " + allNames };
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, monthly: {}, daily: {} };
  }
  
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  // Find indices based on headers
  var statusIdx = headers.indexOf("статус");
  var placementIdx = headers.indexOf("размещение верно");
  var userIdx = headers.indexOf("фио");
  var shiftIdx = headers.indexOf("смена");
  var dateIdx = headers.indexOf("дата");
  if (dateIdx === -1) dateIdx = headers.indexOf("время");
  if (dateIdx === -1) dateIdx = headers.indexOf("timestamp");
  
  // Fallbacks to default F (5), G (6), H (7), I (8), J (9)
  if (statusIdx === -1) statusIdx = 5;
  if (placementIdx === -1) placementIdx = 6;
  if (userIdx === -1) userIdx = 7;
  if (shiftIdx === -1) shiftIdx = 8;
  if (dateIdx === -1) dateIdx = 9;
  
  var monthlyStats = {};
  var dailyStats = {};
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = String(row[statusIdx] || "").trim();
    var placementCorrect = String(row[placementIdx] || "").trim();
    var userName = String(row[userIdx] || "").trim();
    var shiftName = String(row[shiftIdx] || "").trim();
    if (shiftName) {
      var digits = shiftName.match(/\d+/);
      if (digits) {
        shiftName = digits[0] + " смена";
      }
    }
    var dateVal = row[dateIdx];
    
    if (!status) continue;
    
    var dateObj = null;
    if (dateVal instanceof Date) {
      dateObj = dateVal;
    } else if (dateVal) {
      var dateStr = String(dateVal).trim();
      if (dateStr.indexOf(".") !== -1) {
        var parts = dateStr.split(" ")[0].split(".");
        if (parts.length === 3) {
          var y = parts[2].length === 2 ? "20" + parts[2] : parts[2];
          var m = parseInt(parts[1], 10) - 1;
          var d = parseInt(parts[0], 10);
          dateObj = new Date(y, m, d);
        }
      } else if (dateStr.indexOf("-") !== -1) {
        var datePart = dateStr.split(" ")[0].split("T")[0];
        var parts = datePart.split("-");
        if (parts.length === 3) {
          var y = parts[0];
          var m = parseInt(parts[1], 10) - 1;
          var d = parseInt(parts[2], 10);
          dateObj = new Date(y, m, d);
        }
      } else {
        dateObj = new Date(dateStr);
      }
    }
    
    if (!dateObj || isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
    
    var year = dateObj.getFullYear();
    var month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
    var day = ("0" + dateObj.getDate()).slice(-2);
    
    var monthKey = year + "-" + month;
    var dayKey = year + "-" + month + "-" + day;
    
    // Initialize monthly stats
    if (!monthlyStats[monthKey]) {
      monthlyStats[monthKey] = {
        total: 0,
        confirmed: 0,
        missing: 0,
        placementCorrect: 0,
        placementIncorrect: 0,
        shifts: {
          "1 смена": { total: 0, confirmed: 0, missing: 0 },
          "2 смена": { total: 0, confirmed: 0, missing: 0 },
          "3 смена": { total: 0, confirmed: 0, missing: 0 },
          "4 смена": { total: 0, confirmed: 0, missing: 0 }
        },
        users: {}
      };
    }
    
    // Initialize daily stats
    if (!dailyStats[dayKey]) {
      dailyStats[dayKey] = {
        total: 0,
        confirmed: 0,
        missing: 0,
        placementCorrect: 0,
        placementIncorrect: 0,
        shifts: {
          "1 смена": { total: 0, confirmed: 0, missing: 0 },
          "2 смена": { total: 0, confirmed: 0, missing: 0 },
          "3 смена": { total: 0, confirmed: 0, missing: 0 },
          "4 смена": { total: 0, confirmed: 0, missing: 0 }
        },
        users: {}
      };
    }
    
    var normStatus = status.toLowerCase();
    var isConfirmed = normStatus.indexOf("подтвержд") !== -1 || normStatus.indexOf("собр") !== -1 || normStatus === "да" || normStatus.indexOf("готово") !== -1 || normStatus.indexOf("выполн") !== -1 || normStatus.indexOf("найд") !== -1 || normStatus === "ok";
    var isMissing = normStatus.indexOf("отсут") !== -1 || normStatus.indexOf("нет") !== -1 || normStatus.indexOf("не ") !== -1 || normStatus.indexOf("ненайд") !== -1;

    var normPlacement = placementCorrect.toLowerCase();
    var isPlacementOk = normPlacement === "да" || normPlacement === "yes" || normPlacement === "верно";
    var isPlacementBad = normPlacement === "нет" || normPlacement === "no" || normPlacement === "неверно";

    // Update monthly and daily stats
    [monthlyStats[monthKey], dailyStats[dayKey]].forEach(function(s) {
      s.total += 1;
      
      if (isConfirmed) {
        s.confirmed += 1;
      } else if (isMissing) {
        s.missing += 1;
      } else {
        s.confirmed += 1;
      }
      
      if (isPlacementOk) {
        s.placementCorrect += 1;
      } else if (isPlacementBad) {
        s.placementIncorrect += 1;
      }
      
      if (shiftName) {
        if (!s.shifts[shiftName]) {
          s.shifts[shiftName] = { total: 0, confirmed: 0, missing: 0 };
        }
        s.shifts[shiftName].total += 1;
        if (isConfirmed) {
          s.shifts[shiftName].confirmed += 1;
        } else if (isMissing) {
          s.shifts[shiftName].missing += 1;
        } else {
          s.shifts[shiftName].confirmed += 1;
        }
      }
      
      if (userName) {
        if (!s.users[userName]) {
          s.users[userName] = { total: 0, confirmed: 0, missing: 0 };
        }
        s.users[userName].total += 1;
        if (isConfirmed) {
          s.users[userName].confirmed += 1;
        } else if (isMissing) {
          s.users[userName].missing += 1;
        } else {
          s.users[userName].confirmed += 1;
        }
      }
    });
  }
  
  return {
    success: true,
    monthly: monthlyStats,
    daily: dailyStats
  };
}

function getGrafanaStats(ss, mode) {
  var rawStats = getStats(ss, mode);
  var employeeList = [];
  var shiftList = [];
  var timeSeriesList = [];
  var grandTotal = 0;
  var grandConfirmed = 0;
  var grandMissing = 0;

  var dateKeys = Object.keys(rawStats).sort();

  dateKeys.forEach(function(dateStr) {
    var dateData = rawStats[dateStr];
    var dayConfirmed = 0;
    var dayMissing = 0;
    var dayTotal = 0;

    Object.keys(dateData).forEach(function(shiftName) {
      var sData = dateData[shiftName];
      dayConfirmed += sData.confirmed;
      dayMissing += sData.missing;
      dayTotal += sData.total;

      grandConfirmed += sData.confirmed;
      grandMissing += sData.missing;
      grandTotal += sData.total;

      var accuracy = sData.total > 0 ? Math.round((sData.confirmed / sData.total) * 100) : 100;
      shiftList.push({
        date: dateStr,
        shift: shiftName,
        confirmed: sData.confirmed,
        kolichestvo: sData.confirmedQty || sData.confirmed,
        missing: sData.missing,
        missing_kolichestvo: sData.missingQty || sData.missing,
        total: sData.total,
        total_kolichestvo: sData.totalQty || sData.total,
        accuracy_percent: accuracy
      });

      if (sData.users) {
        Object.keys(sData.users).forEach(function(userName) {
          var val = sData.users[userName];
          var skuCount = typeof val === "number" ? val : (val.sku || 0);
          var qtyCount = typeof val === "number" ? val : (val.qty || val.sku || 0);
          employeeList.push({
            date: dateStr,
            shift: shiftName,
            employee: userName,
            sobrano: skuCount,
            kolichestvo: qtyCount,
            scans: skuCount
          });
        });
      }
    });

    var ts = new Date(dateStr).getTime();
    timeSeriesList.push({
      timestamp: isNaN(ts) ? Date.now() : ts,
      date: dateStr,
      confirmed: dayConfirmed,
      missing: dayMissing,
      total: dayTotal
    });
  });

  var overallAccuracy = grandTotal > 0 ? Math.round((grandConfirmed / grandTotal) * 100) : 100;

  return {
    success: true,
    metrics: {
      total_scans: grandTotal,
      confirmed: grandConfirmed,
      missing: grandMissing,
      overall_accuracy_percent: overallAccuracy
    },
    employees: employeeList,
    shifts: shiftList,
    timeseries: timeSeriesList
  };
}

