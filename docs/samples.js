export const SAMPLE_FILES = [
  {
    path: "MeetingProof/README.md",
    content: `# MeetingProof

Browser-local evidence-linked meeting follow-up.

## Run
python3 -m http.server 8000 --directory docs

## Boundaries
Notes are processed locally. Missing owners and dates remain missing.
`,
  },
  {
    path: "MeetingProof/LICENSE",
    content: "MIT License\nCopyright (c) 2026 Matthew Paver",
  },
  {
    path: "MeetingProof/docs/app.js",
    content: `const notes = document.querySelector("#meetingNotes");
function approve(record) {
  localStorage.setItem("meetingproof:approved:v1", JSON.stringify(record));
}
function clearApproved() {
  localStorage.removeItem("meetingproof:approved:v1");
}
`,
  },
  {
    path: "MeetingProof/tests/test_graph.py",
    content: `def test_export_requires_human_approval():
    assert True

def test_missing_owner_is_not_invented():
    assert True
`,
  },
  {
    path: "MeetingProof/docs/index.html",
    content: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>MeetingProof</title></head>
<body><main id="workspace">Browser-local meeting review</main></body>
</html>`,
  },
];
