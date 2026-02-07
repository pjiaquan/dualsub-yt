import { parseCaptionText } from "../src/captions/parser.js";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = () => {
  const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHello world\n\n2\n00:00:03.000 --> 00:00:04.000\nSecond line`;
  const vttCues = parseCaptionText(vtt);
  assert(vttCues.length === 2, "expected two VTT cues");
  assert(vttCues[0].text === "Hello world", "VTT cue text mismatch");

  const xml =
    "<transcript>" +
    "<text start=\"1.0\" dur=\"1.5\">Hello &amp; world</text>" +
    "<text start=\"3.0\" dur=\"2.0\">Line&lt;br/&gt;Two</text>" +
    "</transcript>";
  const xmlCues = parseCaptionText(xml);
  assert(xmlCues.length === 2, "expected two XML cues");
  assert(xmlCues[0].text === "Hello & world", "XML entity decoding failed");
  assert(xmlCues[1].text === "Line\nTwo", "XML line break parsing failed");

  const xmlMissingDur =
    "<transcript>" +
    "<text start=\"5.0\">No explicit duration</text>" +
    "</transcript>";
  const xmlMissingDurCues = parseCaptionText(xmlMissingDur);
  assert(xmlMissingDurCues.length === 1, "expected XML cue even when dur is missing");
  assert(xmlMissingDurCues[0].start === 5, "XML missing dur start time mismatch");
  assert(xmlMissingDurCues[0].end === 7, "XML missing dur should use default duration");

  const srv3 =
    "<timedtext format=\"3\"><body>" +
    "<p t=\"1000\" d=\"1500\"><s>Hello </s><s>world</s></p>" +
    "<p t=\"3000\" d=\"1000\">Line&lt;br/&gt;Two</p>" +
    "</body></timedtext>";
  const srv3Cues = parseCaptionText(srv3);
  assert(srv3Cues.length === 2, "expected two srv3 XML cues");
  assert(srv3Cues[0].start === 1, "srv3 start time should be milliseconds-based");
  assert(srv3Cues[0].text === "Hello world", "srv3 segmented text parsing failed");
  assert(srv3Cues[1].text === "Line\nTwo", "srv3 line break parsing failed");

  const srv3MissingD = "<timedtext format=\"3\"><body><p t=\"4500\">No duration in srv3</p></body></timedtext>";
  const srv3MissingDCues = parseCaptionText(srv3MissingD);
  assert(srv3MissingDCues.length === 1, "expected srv3 cue even when d is missing");
  assert(srv3MissingDCues[0].start === 4.5, "srv3 missing d start mismatch");
  assert(srv3MissingDCues[0].end === 6.5, "srv3 missing d should use default duration");

  const json3 = JSON.stringify({
    events: [
      { tStartMs: 500, dDurationMs: 1000, segs: [{ utf8: "Traditional" }, { utf8: " Chinese" }] },
      { tStartMs: 2000, dDurationMs: 800, segs: [{ utf8: "Subtitle" }] }
    ]
  });
  const json3Cues = parseCaptionText(json3);
  assert(json3Cues.length === 2, "expected two json3 cues");
  assert(json3Cues[0].start === 0.5, "json3 start time conversion failed");
  assert(json3Cues[0].text === "Traditional Chinese", "json3 text concatenation failed");
};

export { run };
