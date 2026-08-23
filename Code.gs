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
    
    // Fixed column positions (1-indexed for getRange)
    var sLower = sheet.getName().trim().toLowerCase();
    var isIzlishkaSheet = (sLower === "излишка" || sLower === "излишки" || sLower === "izlishka");

    if (isIzlishkaSheet) {
      sheet.getRange(rowIndex, 4).setValue(status); // Column D (Status)
      sheet.getRange(rowIndex, 5).setValue(userName); // Column E (FIO)
      sheet.getRange(rowIndex, 6).setValue(shiftName); // Column F (Shift)
      sheet.getRange(rowIndex, 7).setValue(timestamp || new Date()); // Column G (Date)
    } else {
      sheet.getRange(rowIndex, 6).setValue(status); // Column F (Status)
      if (placementCorrect) sheet.getRange(rowIndex, 7).setValue(placementCorrect); // Column G (Placement Correct)
      sheet.getRange(rowIndex, 8).setValue(userName); // Column H (FIO)
      sheet.getRange(rowIndex, 9).setValue(shiftName); // Column I (Shift)
      sheet.getRange(rowIndex, 10).setValue(timestamp || new Date()); // Column J (Date)
    }
    
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

function getStats(ss, force) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "inventory_stats_cache_v6";

  if (!force) {
    try {
      var cachedStr = cache.get(cacheKey);
      if (cachedStr) {
        return JSON.parse(cachedStr);
      }
    } catch (e) {
      // Ignore cache errors
    }
  }

  var sheets = ss.getSheets();
  var stats = {};
  
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName().trim();
    var sLower = sheetName.toLowerCase();
    var normalizedKey = sheetName;
    if (sLower === "излишка" || sLower === "излишки" || sLower === "izlishka") {
      normalizedKey = "излишка";
    }
    
    // Ignore non-shift sheets except we process shift sheets and izlishka
    if (sLower.indexOf("готова") !== -1 || sLower.indexOf("gotova") !== -1 || sLower.indexOf("отчет") !== -1 || sLower.indexOf("report") !== -1) {
      continue;
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) continue;
    
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    
    // Find column indices dynamically with substring matching
    var barcodeIdx = -1;
    var statusIdx = -1;
    var placementIdx = -1;
    var userIdx = -1;
    var dateIdx = -1;
    var qtyIdx = -1;

    for (var h = 0; h < headers.length; h++) {
      var hText = headers[h];
      if (barcodeIdx === -1 && (hText.indexOf("штрих") !== -1 || hText.indexOf("barcode") !== -1 || hText.indexOf("sku") !== -1 || hText.indexOf("артикул") !== -1)) barcodeIdx = h;
      if (statusIdx === -1 && (hText.indexOf("статус") !== -1 || hText.indexOf("status") !== -1)) statusIdx = h;
      if (userIdx === -1 && (hText.indexOf("фио") !== -1 || hText.indexOf("fio") !== -1 || hText.indexOf("пользователь") !== -1 || hText.indexOf("имя") !== -1 || hText.indexOf("сотрудник") !== -1)) userIdx = h;
      if (dateIdx === -1 && (hText.indexOf("дата") !== -1 || hText.indexOf("время") !== -1 || hText.indexOf("date") !== -1 || hText.indexOf("timestamp") !== -1)) dateIdx = h;
      if (placementIdx === -1 && (hText.indexOf("размещение") !== -1 || hText.indexOf("placement") !== -1)) placementIdx = h;
      if (qtyIdx === -1 && (hText.indexOf("количест") !== -1 || hText.indexOf("кол-во") !== -1 || hText.indexOf("qty") !== -1 || hText.indexOf("kol-vo") !== -1 || hText === "кол")) qtyIdx = h;
    }

    var isIzlishkaSheet = (sLower === "излишка" || sLower === "излишки" || sLower === "izlishka");

    // Fallbacks ONLY if header search did not find matching column:
    if (barcodeIdx === -1) barcodeIdx = 0; // Column A
    if (qtyIdx === -1) qtyIdx = isIzlishkaSheet ? 2 : -1; // Izlishka = Col C, Shift = 1 per row
    if (statusIdx === -1) statusIdx = isIzlishkaSheet ? 3 : 5; // Izlishka = D, Shift = F
    if (userIdx === -1) userIdx = isIzlishkaSheet ? 4 : 7;     // Izlishka = E, Shift = H
    if (dateIdx === -1) dateIdx = isIzlishkaSheet ? 6 : 9;     // Izlishka = G, Shift = J
    if (placementIdx === -1) placementIdx = isIzlishkaSheet ? -1 : 6;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var barcode = String(row[barcodeIdx] || "").trim();
      var status = String(row[statusIdx] || "").trim();
      var placementCorrect = (placementIdx !== -1 && row[placementIdx]) ? String(row[placementIdx]).trim() : "";
      var userName = String(row[userIdx] || "").trim();
      
      // If row has no barcode and no user, skip empty rows completely
      if (!barcode && !userName) continue;
      if (!barcode) barcode = "row_" + i;
      
      // Multi-column date check: try primary dateIdx, then check columns 6, 7, 9, 10, 5 if empty
      var rawDate = row[dateIdx];
      if (!rawDate && row[6]) rawDate = row[6];
      if (!rawDate && row[7]) rawDate = row[7];
      if (!rawDate && row[9]) rawDate = row[9];
      if (!rawDate && row[10]) rawDate = row[10];
      if (!rawDate && row[5]) rawDate = row[5];

      var itemQty = 1;
      if (qtyIdx !== -1 && row[qtyIdx] !== undefined) {
        var parsedQty = parseInt(row[qtyIdx], 10);
        if (!isNaN(parsedQty) && parsedQty > 0) itemQty = parsedQty;
      }
      
      // For shift sheets: skip un-audited rows (empty status)
      // For Izlishka sheet: if status is empty BUT userName or valid barcode exists, treat status as "Собрано"
      if (!status || status === "") {
        if (isIzlishkaSheet && (userName !== "" || barcode.indexOf("row_") === -1)) {
          status = "Собрано";
        } else {
          continue;
        }
      }
      
      // Parse Date from timestamp flexibly
      var formattedDate = "";
      try {
        if (rawDate instanceof Date) {
          var year = rawDate.getFullYear();
          var month = ("0" + (rawDate.getMonth() + 1)).slice(-2);
          var day = ("0" + rawDate.getDate()).slice(-2);
          formattedDate = year + "-" + month + "-" + day;
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
              var year = dateObj.getFullYear();
              var month = ("0" + (dateObj.getMonth() + 1)).slice(-2);
              var day = ("0" + dateObj.getDate()).slice(-2);
              formattedDate = year + "-" + month + "-" + day;
            }
          }
        }
      } catch (e) {
        // Ignore date parse errors
      }
      
      // Fallback: If item has status but timestamp is missing/unparseable, fallback to today's date
      if (!formattedDate) {
        var now = new Date();
        var yNow = now.getFullYear();
        var mNow = ("0" + (now.getMonth() + 1)).slice(-2);
        var dNow = ("0" + now.getDate()).slice(-2);
        formattedDate = yNow + "-" + mNow + "-" + dNow;
      }
      
      if (!stats[formattedDate]) {
        stats[formattedDate] = {};
      }
      
      if (!stats[formattedDate][normalizedKey]) {
        stats[formattedDate][normalizedKey] = {
          total: 0,           // Unique barcodes / SKU count
          totalQty: 0,        // Sum of item quantity / pieces
          totalRows: 0,       // Total rows count
          confirmed: 0,       // Confirmed unique SKUs
          confirmedQty: 0,    // Confirmed pieces
          missing: 0,         // Missing unique SKUs
          missingQty: 0,      // Missing pieces
          placementCorrect: 0,
          placementIncorrect: 0,
          barcodesMap: {},
          confirmedBarcodesMap: {},
          missingBarcodesMap: {},
          users: {}
        };
      }
      
      var sData = stats[formattedDate][normalizedKey];
      sData.totalRows += 1;
      sData.totalQty = (sData.totalQty || 0) + itemQty;
      if (!sData.barcodesMap[barcode]) {
        sData.barcodesMap[barcode] = true;
        sData.total += 1;
      }
      
      var normStatus = status.toLowerCase();
      var isConfirmed = normStatus.indexOf("подтвержд") !== -1 || normStatus.indexOf("собр") !== -1 || normStatus === "да" || normStatus.indexOf("готово") !== -1 || normStatus.indexOf("выполн") !== -1 || normStatus.indexOf("найд") !== -1 || normStatus === "ok";
      var isMissing = normStatus.indexOf("отсут") !== -1 || normStatus.indexOf("нет") !== -1 || normStatus.indexOf("не ") !== -1 || normStatus.indexOf("ненайд") !== -1;

      if (isConfirmed) {
        sData.confirmedQty = (sData.confirmedQty || 0) + itemQty;
        if (!sData.confirmedBarcodesMap[barcode]) {
          sData.confirmedBarcodesMap[barcode] = true;
          sData.confirmed += 1;
        }
      } else if (isMissing) {
        sData.missingQty = (sData.missingQty || 0) + itemQty;
        if (!sData.missingBarcodesMap[barcode]) {
          sData.missingBarcodesMap[barcode] = true;
          sData.missing += 1;
        }
      } else {
        sData.confirmedQty = (sData.confirmedQty || 0) + itemQty;
        if (!sData.confirmedBarcodesMap[barcode]) {
          sData.confirmedBarcodesMap[barcode] = true;
          sData.confirmed += 1;
        }
      }
      
      var normPlacement = placementCorrect.toLowerCase();
      var isPlacementOk = normPlacement.indexOf("да") !== -1 || normPlacement.indexOf("yes") !== -1 || normPlacement.indexOf("верн") !== -1 || normPlacement === "ok" || normPlacement === "1" || (normStatus.indexOf("подтвержд") !== -1 && (normPlacement === "" || normPlacement === "да"));
      var isPlacementErr = normPlacement.indexOf("нет") !== -1 || normPlacement.indexOf("no") !== -1 || normPlacement.indexOf("неверн") !== -1 || normPlacement === "0";

      if (isPlacementOk) {
        sData.placementCorrect += 1;
      } else if (isPlacementErr) {
        sData.placementIncorrect += 1;
      }
      
      if (userName) {
        if (!sData.users[userName]) {
          sData.users[userName] = {
            sku: 0,
            qty: 0,
            confirmedSku: 0,
            confirmedQty: 0,
            missingSku: 0,
            missingQty: 0,
            placementCorrect: 0,
            placementIncorrect: 0,
            barcodesMap: {},
            confirmedBarcodesMap: {},
            missingBarcodesMap: {}
          };
        } else if (typeof sData.users[userName] === "number") {
          var oldVal = sData.users[userName];
          sData.users[userName] = {
            sku: oldVal,
            qty: oldVal,
            confirmedSku: oldVal,
            confirmedQty: oldVal,
            missingSku: 0,
            missingQty: 0,
            placementCorrect: 0,
            placementIncorrect: 0,
            barcodesMap: {},
            confirmedBarcodesMap: {},
            missingBarcodesMap: {}
          };
        }

        var uObj = sData.users[userName];
        uObj.qty += itemQty;
        if (!uObj.barcodesMap[barcode]) {
          uObj.barcodesMap[barcode] = true;
          uObj.sku += 1;
        }
        
        if (isPlacementOk) {
          uObj.placementCorrect = (uObj.placementCorrect || 0) + 1;
        } else if (isPlacementErr) {
          uObj.placementIncorrect = (uObj.placementIncorrect || 0) + 1;
        }
        
        if (isConfirmed) {
          uObj.confirmedQty += itemQty;
          if (!uObj.confirmedBarcodesMap[barcode]) {
            uObj.confirmedBarcodesMap[barcode] = true;
            uObj.confirmedSku += 1;
          }
        } else if (isMissing) {
          uObj.missingQty += itemQty;
          if (!uObj.missingBarcodesMap[barcode]) {
            uObj.missingBarcodesMap[barcode] = true;
            uObj.missingSku += 1;
          }
        } else {
          uObj.confirmedQty += itemQty;
          if (!uObj.confirmedBarcodesMap[barcode]) {
            uObj.confirmedBarcodesMap[barcode] = true;
            uObj.confirmedSku += 1;
          }
        }
      }
    }
  }
  
  try {
    var jsonStr = JSON.stringify(stats);
    if (jsonStr.length < 90000) {
      cache.put(cacheKey, jsonStr, 180);
    }
  } catch (cErr) {
    // Ignore cache write errors
  }

  return stats;
}

function getGotovaStats(ss, force) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "gotova_stats_cache_v1";

  if (!force) {
    try {
      var cachedStr = cache.get(cacheKey);
      if (cachedStr) {
        return JSON.parse(cachedStr);
      }
    } catch (e) {
      // Ignore cache errors
    }
  }

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
  
  var resObj = {
    success: true,
    monthly: monthlyStats,
    daily: dailyStats
  };

  try {
    var jsonStr = JSON.stringify(resObj);
    if (jsonStr.length < 90000) {
      cache.put(cacheKey, jsonStr, 180);
    }
  } catch (cErr) {
    // Ignore cache write errors
  }

  return resObj;
}

