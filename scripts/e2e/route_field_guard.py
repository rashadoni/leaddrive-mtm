"""Small, side-effect-free admission checks for Route & Field native evidence."""
from datetime import datetime, timedelta, timezone
import re
import xml.etree.ElementTree as ET

PACKAGE = "com.mtmobileapp"
FIXTURE_ORG = "route-field-acceptance-v1"
FIXTURE_SLUG = "route-field-acceptance"
FIXTURE_MARKER = "route-field-native-acceptance:fictional:v1"


def owner_permissions(package_dump):
    """Never borrow grants from the protected secondary Android profile."""
    block = re.search(r"\bUser 0:.*?(?=\n\s*User \d+:|\Z)", package_dump, re.S)
    require(block is not None, "RF_PERMISSION_PROFILE_UNAVAILABLE")
    result = {}
    for name in ("ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "CAMERA"):
        match = re.search(r"android\.permission\." + name + r": granted=(true|false)([^\n]*)", block[0])
        result[name] = {"granted": bool(match and match[1] == "true"),
                        "flags": re.search(r"flags=\s*(\[[^\]]*\])", match[2])[1]
                        if match and re.search(r"flags=\s*(\[[^\]]*\])", match[2]) else None}
    return result


def require(condition, code):
    if not condition:
        raise ValueError(code)


def verify_apk(identity, expected):
    require(identity.get("package") == expected.get("package") == PACKAGE, "RF_PACKAGE_REFUSED")
    require(type(expected.get("versionCode")) is int and expected["versionCode"] > 0
            and identity.get("versionCode") == expected["versionCode"], "RF_VERSION_REFUSED")
    digest = expected.get("apkSha256", "")
    require(isinstance(digest, str) and re.fullmatch(r"[a-f0-9]{64}", digest)
            and identity.get("apkSha256") == digest, "RF_APK_HASH_REFUSED")
    require(re.fullmatch(r"[a-f0-9]{40}", expected.get("publishedSourceSha", "")), "RF_SOURCE_REFUSED")


def auth_form(xml, password_placeholder):
    """Return only in-memory values for comparison, never for public output."""
    root = ET.fromstring(xml)
    require(all(node.get("package", "") in ("", PACKAGE, "com.android.systemui")
                for node in root.iter("node")), "RF_FOREIGN_WINDOW_REFUSED")
    own = [node for node in root.iter("node") if node.get("package") == PACKAGE]
    by_id = {node.get("resource-id"): node for node in own if node.get("resource-id")}
    require("login-tab-signin" in by_id and "login-email" in by_id
            and "login-password" in by_id and "login-submit" in by_id, "RF_AUTH_SCREEN_REFUSED")
    # An overlay can hide a password field that the accessibility tree still
    # contains. Never infer that a masked value is empty.
    require("app-choice" not in by_id and "login-code-phone" not in by_id,
            "RF_AUTH_OVERLAY_REFUSED")
    password = by_id["login-password"]
    require(password.get("password") == "true"
            and password.get("text", "") in ("", password_placeholder), "RF_NONEMPTY_PASSWORD_REFUSED")
    return {"email": by_id["login-email"].get("text", ""),
            "passwordBlank": True, "signinSelected": by_id["login-tab-signin"].get("selected")}


def verify_auth_preserved(before, after):
    require(before == after, "RF_AUTH_DRAFT_CHANGED")


def fixture_auth_form(xml, password_placeholder):
    """Resume only a blank-password form bound to the owned fixture host."""
    result = auth_form(xml, password_placeholder)
    own_texts = {node.get("text", "") for node in ET.fromstring(xml).iter("node")
                 if node.get("package") == PACKAGE}
    require(FIXTURE_SLUG in own_texts and FIXTURE_SLUG + ".leaddrivecrm.org" in own_texts,
            "RF_FIXTURE_AUTH_HOST_REFUSED")
    return result


def agent_shell(xml, home_required=True):
    root = ET.fromstring(xml)
    require(all(node.get("package", "") in ("", PACKAGE, "com.android.systemui")
                for node in root.iter("node")), "RF_FOREIGN_WINDOW_REFUSED")
    own = [node for node in root.iter("node") if node.get("package") == PACKAGE]
    ids = {node.get("resource-id") for node in own}
    require(all("guide-spot-tab." + tab in ids for tab in ("Today", "Route", "Clients", "Tasks", "More"))
            and "login-email" not in ids, "RF_AGENT_SHELL_REFUSED")
    # This is a UI observation, never a claim of a server-verified role/tenant.
    greetings = [node.get("text", "") for node in own if node.get("class") == "android.widget.TextView"
                 and node.get("text", "").startswith(("Salam, ", "Добрый день, ", "Good day, "))]
    require(len(greetings) <= 1 and (len(greetings) == 1 or not home_required), "RF_HOME_IDENTITY_UNAVAILABLE")
    return greetings[0] if greetings else None


def manager_shell(xml):
    root = ET.fromstring(xml)
    require(all(node.get("package", "") in ("", PACKAGE, "com.android.systemui")
                for node in root.iter("node")), "RF_FOREIGN_WINDOW_REFUSED")
    ids = {node.get("resource-id") for node in root.iter("node") if node.get("package") == PACKAGE}
    require(all("guide-spot-tab." + tab in ids for tab in ("Team", "Planning", "Approvals", "More"))
            and "login-email" not in ids and "guide-spot-tab.Tasks" not in ids,
            "RF_MANAGER_SHELL_REFUSED")
    return "manager-shell"


def verify_manager_case(case, source_sha):
    require(case.get("version") == 1 and case.get("marker") == "rf-owner-manager-switch-v1"
            and case.get("ownerAuthorized") is True and case.get("sourceSha") == source_sha,
            "RF_MANAGER_CASE_REFUSED")
    manager, login = case.get("manager") or {}, case.get("login") or {}
    require(manager.get("role") == "MANAGER" and bool(manager.get("id"))
            and bool(manager.get("organizationId")) and bool(manager.get("name"))
            and manager.get("email") == login.get("email") and bool(login.get("email"))
            and isinstance(login.get("password"), str) and bool(login["password"]),
            "RF_MANAGER_IDENTITY_REFUSED")
    prior = case.get("priorAgent") or {}
    require(prior.get("organizationId") == manager["organizationId"] and bool(prior.get("name"))
            and prior.get("id") != manager["id"], "RF_MANAGER_PRIOR_AGENT_REFUSED")
    task = case.get("completedTask") or {}
    require(task.get("status") == "COMPLETED" and task.get("version") == 3
            and task.get("agentId") == prior.get("id") and bool(task.get("id"))
            and case.get("nonTestTasksUnchanged") is True, "RF_MANAGER_TASK_NOT_RECONCILED")
    title = task.get("title", "")
    require(isinstance(title, str) and re.fullmatch(r"RF-E2E-[0-9]{8}-[0-9]{4} CRM-mobile-CRM TEST", title)
            and task.get("result") == title.split(" ")[0] + " OK", "RF_MANAGER_TASK_NOT_RECONCILED")
    require(isinstance(case.get("cleanSyncText"), str) and bool(case["cleanSyncText"].strip()),
            "RF_UNSYNCED_AGENT_REFUSED")


def verify_owner_task_case(case, source_sha, flow):
    require(flow in ("task-start", "task-complete"), "RF_TASK_FLOW_REFUSED")
    require(case.get("version") == 1 and case.get("marker") == "rf-owner-web-task-v1"
            and case.get("createdViaUi") is True and case.get("sourceSha") == source_sha, "RF_TASK_CASE_REFUSED")
    require(isinstance(case.get("taskId"), str) and re.fullmatch(r"[A-Za-z0-9_-]{8,96}", case["taskId"]),
            "RF_TASK_ID_REFUSED")
    title = case.get("title", "")
    require(isinstance(title, str) and re.fullmatch(r"RF-E2E-[0-9]{8}-[0-9]{4} CRM-mobile-CRM TEST", title),
            "RF_TASK_TITLE_REFUSED")
    require(case.get("result") == title.split(" ")[0] + " OK", "RF_TASK_RESULT_REFUSED")
    require(case.get("statusBefore") == ("PENDING" if flow == "task-start" else "IN_PROGRESS"),
            "RF_TASK_STATUS_REFUSED")
    require(isinstance(case.get("browserRunId"), str)
            and re.fullmatch(r"[a-f0-9-]{36}", case["browserRunId"]), "RF_TASK_BROWSER_PROOF_REFUSED")


def verify_fixture(manifest, bootstrap, role):
    """No fallback to customer accounts or the tenant in Time's real24h run."""
    require(role in ("AGENT", "MANAGER"), "RF_ROLE_REFUSED")
    require(manifest.get("marker") == FIXTURE_MARKER and manifest.get("organizationId") == FIXTURE_ORG
            and manifest.get("slug") == FIXTURE_SLUG, "RF_FIXTURE_REFUSED")
    principal = bootstrap.get("principal") or {}
    tenant = bootstrap.get("tenant") or {}
    contract = bootstrap.get("manifest") or {}
    require(tenant.get("id") == FIXTURE_ORG and (contract.get("tenant") or {}).get("id") == FIXTURE_ORG,
            "RF_TENANT_REFUSED")
    expected_id = manifest.get("principals", {}).get(role)
    require(isinstance(expected_id, str) and bool(expected_id) and principal.get("id") == expected_id
            and (contract.get("principal") or {}).get("id") == expected_id
            and principal.get("role") == role and (contract.get("principal") or {}).get("role") == role,
            "RF_PRINCIPAL_REFUSED")
    capabilities = bootstrap.get("capabilities")
    needed = "FIELD_EXECUTE" if role == "AGENT" else "TEAM_READ"
    require(isinstance(capabilities, list) and needed in capabilities, "RF_CAPABILITY_REFUSED")
    if role == "AGENT":
        route_module = (contract.get("modules") or {}).get("routeField") or {}
        require(route_module.get("enabled") is True, "RF_ROUTE_MODULE_REFUSED")


def verify_fixture_case(case, source_sha):
    require(case.get("version") == 1 and case.get("marker") == "rf-native-fictional-v1"
            and case.get("ownerAuthorized") is True and case.get("sourceSha") == source_sha,
            "RF_FIXTURE_CASE_REFUSED")
    prepared = case.get("preparation") or {}
    require(prepared.get("status") == "PASS" and prepared.get("tenant") == FIXTURE_SLUG
            and isinstance(prepared.get("artifactSha"), str)
            and re.fullmatch(r"[a-f0-9]{40}", prepared["artifactSha"])
            and (prepared.get("users"), prepared.get("agents"), prepared.get("customers")) == (1, 3, 3),
            "RF_FIXTURE_PREPARATION_REFUSED")
    verify_fixture(case.get("manifest") or {}, case.get("bootstrap") or {}, "AGENT")
    login = case.get("login") or {}
    require(login.get("email") == "agent@route-field-acceptance.example.invalid"
            and isinstance(login.get("password"), str)
            and re.fullmatch(r"[A-Za-z0-9_-]{64}", login["password"]),
            "RF_FIXTURE_CREDENTIAL_REFUSED")
    require(case.get("expectedName") == "RF QA fictional field employee"
            and case.get("companyName") == "Route Field Native Acceptance (fictional)",
            "RF_FIXTURE_IDENTITY_REFUSED")


def verify_observation_window(progress, now, maximum_seconds=360):
    """Do not take the shared phone during the Time controller's final UI window."""
    if progress.get("status") != "RUNNING":
        return
    started = datetime.fromisoformat(progress["offlineAt"].replace("Z", "+00:00"))
    require(started.tzinfo is not None and now.tzinfo is not None, "RF_COORDINATION_TIME_REFUSED")
    first_ui = started + timedelta(hours=23, minutes=50)
    last_ui = started + timedelta(hours=24, minutes=35)
    end = now.astimezone(timezone.utc) + timedelta(seconds=maximum_seconds)
    require(end < first_ui or now > last_ui, "RF_PROTECTED_UI_WINDOW")
