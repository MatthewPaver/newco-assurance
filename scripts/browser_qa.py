import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:4175")
ARTIFACTS = Path("artifacts/browser-qa")
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def assert_no_horizontal_overflow(page):
    overflow = page.evaluate(
        "() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"
    )
    assert not overflow, "Page has horizontal overflow"


def run():
    results = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
        console_errors = []
        desktop.on(
            "console",
            lambda message: console_errors.append(message.text) if message.type == "error" else None,
        )
        desktop.goto(BASE_URL, wait_until="networkidle")
        assert desktop.title().startswith("Newco Assurance")
        assert desktop.get_by_role("heading", name="Know what your organisation can rely on.").is_visible()
        assert desktop.get_by_text("Browser-local", exact=True).is_visible()
        assert_no_horizontal_overflow(desktop)
        desktop.screenshot(path=str(ARTIFACTS / "desktop-home.png"), full_page=True)

        desktop.get_by_role("button", name="MeetingProof public workflow").click()
        desktop.locator("#report").wait_for(state="visible")
        assert desktop.locator("#resultLabel").inner_text() == "Conditional"
        assert desktop.locator("#fixFirstList > li").count() <= 3
        assert desktop.get_by_text("Required reading", exact=True).is_visible()
        assert desktop.get_by_text("Production reliance requires independent review", exact=False).count() == 1
        assert_no_horizontal_overflow(desktop)
        desktop.screenshot(path=str(ARTIFACTS / "desktop-report.png"), full_page=True)

        desktop.locator("#reviewerName").fill("Independent delivery reviewer")
        desktop.locator("#reviewDecision").select_option("team-conditional")
        desktop.locator("#reviewConditions").fill("No personal data. Re-scan after each material change.")
        desktop.locator("#reviewCheck").check()
        desktop.locator("#approveReport").click()
        desktop.locator("#approvedRecord").wait_for(state="visible")
        assert desktop.get_by_text("A decision with evidence—not a badge.").is_visible()
        with desktop.expect_download() as download_info:
            desktop.locator("#downloadJson").click()
        download = download_info.value
        download_path = ARTIFACTS / "newco-assurance-record.json"
        download.save_as(download_path)
        record = json.loads(download_path.read_text())
        assert record["schema_version"] == "newco.assurance-record.v1"
        assert len(record["scan"]["source"]["sha256"]) == 64
        assert "fingerprintSeed" not in record["scan"]["source"]
        assert not console_errors, f"Browser console errors: {console_errors}"
        results["desktop"] = "complete journey and export passed"

        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        mobile.goto(BASE_URL, wait_until="networkidle")
        assert mobile.get_by_role("heading", name="Know what your organisation can rely on.").is_visible()
        assert_no_horizontal_overflow(mobile)
        mobile.get_by_role("button", name="MeetingProof public workflow").click()
        mobile.locator("#report").wait_for(state="visible")
        assert mobile.locator("#fixFirstList > li").count() <= 3
        assert_no_horizontal_overflow(mobile)
        mobile.screenshot(path=str(ARTIFACTS / "mobile-report.png"), full_page=True)
        results["mobile"] = "390px sample journey passed"

        no_js_context = browser.new_context(java_script_enabled=False, viewport={"width": 1280, "height": 900})
        no_js = no_js_context.new_page()
        no_js.goto(BASE_URL, wait_until="load")
        no_js.screenshot(path=str(ARTIFACTS / "no-javascript.png"), full_page=True)
        assert no_js.locator(".noscript-panel").is_visible()
        assert "JavaScript is required" in no_js.locator(".noscript-panel").inner_text()
        assert no_js.get_by_role("heading", name="Three inspection layers. One independent decision.").is_visible()
        results["no_javascript"] = "boundary and product explanation remain visible"
        no_js_context.close()

        browser.close()

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    run()
