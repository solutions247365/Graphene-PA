/* ==========================================================================
   Graphene PA — radial hub menu
   Non-modal circular menu: opens from the header button, dismisses on outside
   press or Escape. Arrow keys walk the ring, and the glow behind the ring
   follows whichever item is active, hovered, or focused.
   ========================================================================== */

(function () {
  "use strict";

  var trigger = document.getElementById("hub-trigger");
  var hub = document.getElementById("hub");
  var core = document.getElementById("hub-core");

  if (!trigger || !hub) return;

  var isOpen = false;
  var closeTimer = null;

  function items() {
    return Array.prototype.slice.call(hub.querySelectorAll(".hub-btn"));
  }

  function angleOf(btn) {
    var item = btn.closest(".hub-item");
    return item ? item.style.getPropertyValue("--angle").trim() : "";
  }

  /* Aim the glow at a given button, or back at the active one when passed
     nothing. */
  function aimGlow(btn) {
    var target = btn || hub.querySelector(".hub-btn.is-active");
    if (!target) return;
    var angle = angleOf(target);
    if (angle) hub.style.setProperty("--active-angle", angle);
  }

  function open() {
    if (isOpen) return;
    isOpen = true;

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    aimGlow(null);
    hub.hidden = false;
    /* Reflow so the scaled-down start state is registered before [data-open]
       animates it up — otherwise the hub just appears at full size. */
    void hub.offsetHeight;
    hub.setAttribute("data-open", "");
    trigger.setAttribute("aria-expanded", "true");
  }

  function close(restoreFocus) {
    if (!isOpen) return;
    isOpen = false;

    /* Move focus out before the hub is hidden so it never sits on a
       display:none element. */
    if (restoreFocus || hub.contains(document.activeElement)) {
      trigger.focus();
    }

    hub.removeAttribute("data-open");
    trigger.setAttribute("aria-expanded", "false");

    closeTimer = setTimeout(function () {
      hub.hidden = true;
      aimGlow(null);
      closeTimer = null;
    }, 380);
  }

  /* ---- open / close ------------------------------------------------------- */

  trigger.addEventListener("click", function (e) {
    e.stopPropagation();
    isOpen ? close(true) : open();
  });

  /* Light dismiss: the hub is non-modal, so an outside press closes it and is
     otherwise left alone to reach whatever it hit. */
  document.addEventListener("pointerdown", function (e) {
    if (!isOpen) return;
    if (hub.contains(e.target) || trigger.contains(e.target)) return;
    close(false);
  });

  /* ---- selection ---------------------------------------------------------- */

  hub.addEventListener("click", function (e) {
    var btn = e.target.closest(".hub-btn");

    if (btn) {
      items().forEach(function (el) {
        el.classList.toggle("is-active", el === btn);
        if (el === btn) {
          el.setAttribute("aria-current", "page");
        } else {
          el.removeAttribute("aria-current");
        }
      });
      aimGlow(btn);
      close(true);
      return;
    }

    /* The core is the primary action rather than a destination — it hands off
       to the composer. */
    if (core && core.contains(e.target)) {
      close(false);
      var input = document.querySelector(".composer-input");
      if (input) input.focus();
    }
  });

  /* ---- glow follows hover / focus ----------------------------------------- */

  hub.addEventListener("pointerover", function (e) {
    var btn = e.target.closest(".hub-btn");
    if (btn) aimGlow(btn);
  });

  hub.addEventListener("pointerout", function (e) {
    if (e.target.closest(".hub-btn")) aimGlow(null);
  });

  hub.addEventListener("focusin", function (e) {
    var btn = e.target.closest(".hub-btn");
    aimGlow(btn);
  });

  /* ---- keyboard ----------------------------------------------------------- */

  document.addEventListener("keydown", function (e) {
    if (!isOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }

    var list = items();
    var i = list.indexOf(document.activeElement);

    var forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    var back = e.key === "ArrowLeft" || e.key === "ArrowUp";

    if (forward || back) {
      e.preventDefault();
      if (i === -1) {
        /* Enter the ring at the active item. */
        var active = hub.querySelector(".hub-btn.is-active") || list[0];
        active.focus();
      } else {
        /* Wrap around the circle in both directions. */
        var next = (i + (forward ? 1 : -1) + list.length) % list.length;
        list[next].focus();
      }
    } else if (e.key === "Home" && i !== -1) {
      e.preventDefault();
      list[0].focus();
    } else if (e.key === "End" && i !== -1) {
      e.preventDefault();
      list[list.length - 1].focus();
    }
  });

  /* Opening by keyboard moves focus into the ring; opening by tap leaves
     focus on the trigger so no item lights up under the finger. */
  trigger.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;

    setTimeout(function () {
      if (!isOpen) return;
      var active = hub.querySelector(".hub-btn.is-active") || items()[0];
      if (active) active.focus();
    }, 0);
  });
})();
