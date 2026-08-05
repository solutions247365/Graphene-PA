/* ==========================================================================
   Graphene PA — floating menu rail
   Non-modal left rail: opens from the header button, dismisses on outside
   tap, Escape, or selecting an item. Arrow keys walk the rail like a menu.
   ========================================================================== */

(function () {
  "use strict";

  var trigger = document.getElementById("rail-trigger");
  var rail = document.getElementById("rail");

  if (!trigger || !rail) return;

  var isOpen = false;
  var closeTimer = null;

  function buttons() {
    return Array.prototype.slice.call(rail.querySelectorAll(".rail-btn"));
  }

  function open() {
    if (isOpen) return;
    isOpen = true;

    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }

    rail.hidden = false;
    /* Reflow so the browser registers the off-screen start position before
       [data-open] animates it in — otherwise the rail just appears. */
    void rail.offsetHeight;
    rail.setAttribute("data-open", "");
    trigger.setAttribute("aria-expanded", "true");
  }

  function close(restoreFocus) {
    if (!isOpen) return;
    isOpen = false;

    /* Move focus out before the rail is hidden so it never sits on a
       display:none element. */
    if (restoreFocus || rail.contains(document.activeElement)) {
      trigger.focus();
    }

    rail.removeAttribute("data-open");
    trigger.setAttribute("aria-expanded", "false");

    closeTimer = setTimeout(function () {
      rail.hidden = true;
      closeTimer = null;
    }, 340);
  }

  /* ---- open / close ------------------------------------------------------- */

  trigger.addEventListener("click", function (e) {
    e.stopPropagation();
    isOpen ? close(true) : open();
  });

  /* Light dismiss: any pointer press outside the rail closes it. The rail is
     non-modal, so the press itself is left alone to reach whatever it hit. */
  document.addEventListener("pointerdown", function (e) {
    if (!isOpen) return;
    if (rail.contains(e.target) || trigger.contains(e.target)) return;
    close(false);
  });

  /* Selecting a destination closes the rail. */
  rail.addEventListener("click", function (e) {
    var btn = e.target.closest(".rail-btn");
    if (!btn) return;

    buttons().forEach(function (el) {
      el.classList.toggle("is-active", el === btn);
      if (el === btn) {
        el.setAttribute("aria-current", "page");
      } else {
        el.removeAttribute("aria-current");
      }
    });

    close(true);
  });

  /* ---- keyboard ----------------------------------------------------------- */

  document.addEventListener("keydown", function (e) {
    if (!isOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }

    var items = buttons();
    var i = items.indexOf(document.activeElement);

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (i === -1) {
        items[0].focus();
      } else {
        var next = e.key === "ArrowDown" ? i + 1 : i - 1;
        /* Wrap at both ends. */
        items[(next + items.length) % items.length].focus();
      }
    } else if (e.key === "Home" && i !== -1) {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End" && i !== -1) {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  });

  /* Opening by keyboard should land focus on the rail; opening by tap should
     not, so the tooltip doesn't stick open under the finger. */
  trigger.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowRight") return;
    if (e.key === "ArrowRight" && !isOpen) open();

    setTimeout(function () {
      if (!isOpen) return;
      var active = rail.querySelector(".rail-btn.is-active") || buttons()[0];
      if (active) active.focus();
    }, 0);
  });
})();
