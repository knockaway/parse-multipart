/**
  ***** KNOCK HEADER *****
  Changes author: Bigi Lui @bigicoin
  Reason for change:

  A lot of assumptions in original library, such as having "filename" in header line,
  having a "Content-Type: text/plain" second info line after header.

  We use this for parsing Hellosign API webhooks specifically, which uses multipart formdata,
  but doesn't have any of those info.

  Example request via AWS API Gateway taking in multipart formdata is like:
  headers: {
    'Content-Type': 'multipart/form-data; boundary=----------------------------adfbe35d44dd'
  }
  body: '------------------------------adfbe35d44dd\r\nContent-Disposition: form-data; name="json"\r\n\r\n{"event":{"event_type":"callback_test","event_time":"1543873386","event_hash":"fc76009f280f918b7f9031f4023c83728be4984094250a198937ef040d902b39","event_metadata":{"related_signature_id":null,"reported_for_account_id":"afbadf0b73b71e56c56b0af614bd66c24cb7e166","reported_for_app_id":null,"event_message":null}}}\r\n------------------------------adfbe35d44dd--\r\n',

  ***** ORIGINAL HEADER *****
 	Multipart Parser (Finite State Machine)

	usage:

	var multipart = require('./multipart.js');
	var body = multipart.DemoData(); 							   // raw body
	var body = new Buffer(event['body-json'].toString(),'base64'); // AWS case
	
	var boundary = multipart.getBoundary(event.params.header['content-type']);
	var parts = multipart.Parse(body,boundary);
	
	// each part is:
	// { filename: 'A.txt', type: 'text/plain', data: <Buffer 41 41 41 41 42 42 42 42> }

	author:  Cristian Salazar (christiansalazarh@gmail.com) www.chileshift.cl
			 Twitter: @AmazonAwsChile
 */
exports.Parse = function(multipartBodyBuffer, boundary) {
  var process = function(part) {
    // will transform this object:
    // { header: 'Content-Disposition: form-data; name="uploads[]"; filename="A.txt"',
    //	 info: 'Content-Type: text/plain',
    //	 part: 'AAAABBBB' }
    // into this one:
    // { filename: 'A.txt', type: 'text/plain', data: <Buffer 41 41 41 41 42 42 42 42> }
    var obj = function(str) {
      var k = str.split("=");
      var a = k[0].trim();
      var b = JSON.parse(k[1].trim());
      var o = {};
      Object.defineProperty(o, a, {
        value: b,
        writable: true,
        enumerable: true,
        configurable: true
      });
      return o;
    };
    var header = part.header.split(";");
    var key = obj(header[1]);
    var file = header[2] ? obj(header[2]) : {};
    Object.defineProperty(file, "key", {
      value: key.name,
      writable: true,
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(file, "value", {
      value: new Buffer(part.part).toString(),
      writable: true,
      enumerable: true,
      configurable: true
    });
    return file;
  };
  var prev = null;
  var lastline = "";
  var header = "";
  var info = "";
  var state = 0;
  var buffer = [];
  var allParts = [];

  if (typeof multipartBodyBuffer === "string") {
    multipartBodyBuffer = Buffer(multipartBodyBuffer);
  }

  for (i = 0; i < multipartBodyBuffer.length; i++) {
    var oneByte = multipartBodyBuffer[i];
    var prevByte = i > 0 ? multipartBodyBuffer[i - 1] : null;
    var newLineDetected = oneByte == 0x0a && prevByte == 0x0d ? true : false;
    var newLineChar = oneByte == 0x0a || oneByte == 0x0d ? true : false;

    if (!newLineChar) lastline += String.fromCharCode(oneByte);

    if (0 == state && newLineDetected) {
      if ("--" + boundary == lastline) {
        state = 1;
      }
      lastline = "";
    } else if (1 == state && newLineDetected) {
      header = lastline;
      state = 2;
      lastline = "";
    } else if (2 == state && newLineDetected) {
      info = lastline;
      state = 3;
      lastline = "";
    } else if (3 == state) {
      if (lastline.length > boundary.length + 4) lastline = ""; // mem save
      if ("--" + boundary == lastline) {
        var j = buffer.length - lastline.length;
        var part = buffer.slice(0, j - 1);
        var p = { header: header, info: info, part: part };
        allParts.push(process(p));
        buffer = [];
        lastline = "";
        state = 4;
        header = "";
        info = "";
      } else {
        buffer.push(oneByte);
      }
      if (newLineDetected) lastline = "";
    } else if (4 == state) {
      if (newLineDetected) state = 1;
    }
  }

  // Knock-specific logic:
  // Put together parts like: [{key: 'foo', value: 'abc'}, {key: 'foo', value: 'def'}, {key: 'bar', value: '123'}]
  // Into simple object like: {foo: 'abcdef', bar: '123'}
  var result = {};
  for (i = 0; i < allParts.length; i++) {
    if (!result[allParts[i].key]) {
      result[allParts[i].key] = allParts[i].value;
    } else {
      result[allParts[i].key] = result[allParts[i].key].concat(
        allParts[i].value
      );
    }
  }
  return result;
};

//  read the boundary from the content-type header sent by the http client
//  this value may be similar to:
//  'multipart/form-data; boundary=----WebKitFormBoundaryvm5A9tzU1ONaGP5B',
exports.getBoundary = function(header) {
  var items = header.split(";");
  if (items)
    for (i = 0; i < items.length; i++) {
      var item = new String(items[i]).trim();
      if (item.indexOf("boundary") >= 0) {
        var k = item.split("=");
        return new String(k[1]).trim();
      }
    }
  return "";
};
