// Shared site code for the task-flow fixtures (M3). This is "the website", not Anchor.
//
// 1. Echo: elements with data-echo="<field>" show what was submitted on the previous page, the way
//    real review pages do. Tests use this to prove Anchor never stores typed text, even when the
//    site shows it again next to a button.
// 2. Untrusted-event log: window.untrusted lists every pointer, mouse, keyboard or submit event that
//    was not made by a real person (isTrusted false). Anchor must never cause one (Hard Rule 1).
// 3. Detours: ?detour=cookie|survey|session|details adds a dialog after load, with its own buttons
//    that close it. Anchor must name it and wait, never close it.
(function () {
  window.untrusted = [];
  for (const type of ["pointerdown", "mousedown", "mouseup", "click", "keydown", "submit"]) {
    document.addEventListener(
      type,
      (e) => {
        if (!e.isTrusted) window.untrusted.push(type);
      },
      true,
    );
  }

  const params = new URLSearchParams(location.search);
  for (const el of document.querySelectorAll("[data-echo]")) {
    el.textContent = params.get(el.getAttribute("data-echo")) || "";
  }

  const DETOURS = {
    cookie: {
      role: "dialog",
      title: "We value your privacy",
      text: "We use cookies to improve your experience. You can choose which cookies to allow.",
      buttons: ["Accept all", "Reject all"],
    },
    survey: {
      tag: "dialog",
      title: "How are we doing?",
      text: "Take a 2-minute survey about your visit today.",
      buttons: ["Start survey", "No thanks"],
    },
    session: {
      role: "alertdialog",
      title: "Your session is about to expire",
      text: "For your security, you will be signed out in 2 minutes.",
      buttons: ["Stay signed in"],
    },
    details: {
      role: "dialog",
      title: "Please update your details",
      text: "Confirm your phone number and mailing address so we can reach you.",
      buttons: ["Update now", "Remind me later"],
    },
  };

  const which = params.get("detour");
  const d = which && DETOURS[which];
  if (!d) return;
  setTimeout(() => {
    const box = document.createElement(d.tag || "div");
    box.className = "site-detour";
    box.id = "detour";
    if (d.tag === "dialog") box.setAttribute("open", "");
    else {
      box.setAttribute("role", d.role);
      box.setAttribute("aria-modal", "true");
    }
    box.setAttribute("aria-labelledby", "detour-title");
    box.style.cssText =
      "position:fixed;top:20%;left:20%;right:20%;background:#fff;border:2px solid #333;padding:20px;z-index:10";
    const h = document.createElement("h2");
    h.id = "detour-title";
    h.textContent = d.title;
    const p = document.createElement("p");
    p.textContent = d.text;
    box.append(h, p);
    for (const label of d.buttons) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => box.remove());
      box.append(b);
    }
    document.body.append(box);
  }, 300);
})();
