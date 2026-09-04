export function decodeOpReturn(scriptHex) {
    if (!scriptHex || !scriptHex.startsWith("6a")) return null;
    
    try {
        let dataHex = scriptHex.slice(2); // remove '6a'
    
        // If next byte is a valid length prefix (and optional), remove it
        const possibleLengthByte = parseInt(dataHex.slice(0, 2), 16);
        if (dataHex.length >= 2 + possibleLengthByte * 2) {
        dataHex = dataHex.slice(2); // remove length byte
        }
    
        let decoded = '';
        for (let i = 0; i < dataHex.length; i += 2) {
        const hexByte = dataHex.substr(i, 2);
        const charCode = parseInt(hexByte, 16);
        // Printable ASCII range: 32-126
        if (charCode >= 32 && charCode <= 126) {
            decoded += String.fromCharCode(charCode);
        } else {
            decoded += '.'; // show dots for non-printable characters
        }
        }
        return decoded;
    } catch (err) {
        console.error("Error decoding OP_RETURN:", err);
        return null;
    }
}

export function encode(protocol, version, type, resource) {

    const typeMap = {
        "-1": "DOWN Vote",
        "0": "Simple Message",
        "1": "UP Vote",
        "2": "?",
        "3": "POLL_START",
        "4": "POLL_REQUIRED_ANSWER",
        "5": "POLL_BLOCK_EXPIRATION",
        "6": "POLL_VOTE"
      };

    return protocol + ' ' + version + ' ' + type + ' "' + resource + '"';
}

export function decode(m) {

    const exploded = m.split(" ");
    const protocol    = exploded[0];
    const version    = exploded[1];
    const type     = exploded[2];
    const message   = m.match(/"(.*?)"/);
  
    return message[0];
}

export async function op_returns() {

    var messages = [];

    const typeMap = {
        "-9":"null",
        "-1": "DOWN Vote",
        "0": "Simple Message",
        "1": "UP Vote",
        "2": "?",
        "3": "POLL_START",
        "4": "POLL_REQUIRED_ANSWER",
        "5": "POLL_BLOCK_EXPIRATION",
        "6": "POLL_VOTE"
      };
      
    // find a way to fetch ALL op_returns data field in a simple dump file

    op_returns = [
        {
          data: "6a742030202254686520426c6f636b204e6f7465206e6f7720656e61626c6520667265652073706565636820666f722065766572796f6e65207573696e6720626974636f696e7320756e6974206f66206163636f756e7422"
        },
        {
          data: "6a742030202254686520426c6f636b204e6f7465206e6f7720656e61626c6520667265652073706565636820666f722065766572796f6e65207573696e6720626974636f696e7320756e6974206f66206163636f756e7422"
        },
        {
          data: "6a742030202254686520426c6f636b204e6f7465206e6f7720656e61626c6520667265652073706565636820666f722065766572796f6e65207573696e6720626974636f696e7320756e6974206f66206163636f756e7422"
        }
      ];
  
      op_returns.forEach(r => {
        var op_return = decodeOpReturn(r.data);
        var decoded = decode(op_return);
        messages.push(decoded);
      });

      return messages;
}
