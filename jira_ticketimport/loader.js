javascript:(
  function() {
      const targetOrigin = 'https://issues.ww-intern.de';
      const targetOriginName = 'JIRA-Webseiten';
      if ( window.location.origin != targetOrigin ) {
          alert(`Das Bookmarklet kann nur auf ${targetOriginName} (${targetOrigin}) verwendet werden.`);
          return;
      }
      window._ww_app_id = 'jira_ticketimport';
      window._ww_app_baseUrl = `https://ast-wwi.github.io/jira_ticketimport/${_ww_app_id}/`;
      window._ww_app_name = 'JIRA Ticketimport';
      window._ww_load_js = function(jsSrcArray) {
        jsSrcArray.forEach(function(src) {
            let script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.type = 'text/javascript';
            document.head.appendChild(script);
            script.onerror = function() {
                alert(`Beim Laden der Anwendung ${_ww_app_name} ist ein Fehler aufgetreten.\n\nFEHLER: Das Skript: ${src} konnte nicht geladen werden.`);
            }
        });
      };
      _ww_load_js([_ww_app_baseUrl + 'index.js']);
  }
)()