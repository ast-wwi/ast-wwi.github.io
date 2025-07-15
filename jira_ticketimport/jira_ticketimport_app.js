(function () {
	const styleSheetUrl = _ww_app_baseUrl + 'style.css';
	const helpUrl = _ww_app_baseUrl + 'jira_import_help.aspx';
	const jiraIssueUrl = "https://issues.ww-intern.de/jira/rest/api/2/issue/";
	const jiraSearchIssuesBaseUrl = "https://issues.ww-intern.de/jira/issues/";
	const jiraHeaderSelector = "#header > nav > div > div.aui-header-primary";

	const columnNameToSchema = {
		"jira.Projektschlüssel": { path: "project.key", type: "string", minOccurences: 1, maxOccurences: 1 },
		"jira.Vorgangstyp": { path: "issuetype.name", type: "string", minOccurences: 1, maxOccurences: 1 },
		"jira.Zusammenfassung": { path: "summary", type: "string", minOccurences: 1, maxOccurences: 1 },
		"jira.Beschreibung": { path: "description", type: "string", minOccurences: 1, maxOccurences: 1 },
		"jira.Projektzuordnung": { path: "customfield_12340.value", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Merkmal 1": { path: "customfield_11351.value", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Merkmal 2": { path: "customfield_11352.value", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Merkmal 3": { path: "customfield_11940.value", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Merkmal 4": { path: "customfield_16540.value", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Externe ID": { path: "customfield_11346", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Story Points": { path: "customfield_10022", type: "number", minOccurences: 0, maxOccurences: 1 },
		"jira.Epic Link": { path: "customfield_10940", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Komponenten": { path: "components.[].name", type: "string", minOccurences: 0, maxOccurences: Infinity },
		"jira.Akzeptanzkriterien": { path: "customfield_13140", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Bemerkung": { path: "customfield_11843", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Stichwörter": { path: "labels.[]", type: "string", minOccurences: 0, maxOccurences: Infinity },
		"jira.Epic Name": { path: "customfield_10941", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Freitext 1": { path: "customfield_12941", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Freitext 2": { path: "customfield_12942", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Freitext 3": { path: "customfield_12943", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Freitext 4": { path: "customfield_15946", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Fälligkeit": { path: "duedate", type: "date", minOccurences: 0, maxOccurences: 1 },
		"jira.Startdatum": { path: "customfield_13440", type: "date", minOccurences: 0, maxOccurences: 1 },
		"jira.Ansprechpartner": { path: "customfield_11341.name", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Quelle": { path: "customfield_11344", type: "string", minOccurences: 0, maxOccurences: 1 },
		"jira.Priorität": { path: "priority.name", type: "string", minOccurences: 0, maxOccurences: 1 },
	};

	activate();

	async function activate() {
		await injectStylesAndDialogHTML();
		const jiraHeaderElement = document.querySelector(jiraHeaderSelector);
		const jiraVersion = document.querySelector("#jira").dataset.version;
		if (!jiraHeaderElement || !(jiraVersion.split(".")[0] <= 9)) {
			const dialogParams = {
				mainMessage: `Aktivierung des Ticketimports nicht möglich.`,
				messageList: [
					`Diese Version des Bookmarklets kann nicht mit dieser JIRA Version (${jiraVersion}) verwendet werden.`,
					`Es muss eine neue Version des Bookmarklets installiert werden.`,
				],
			};
			showErrorDialog(dialogParams);
			return;
		}
		injectImportButtonsHTML(jiraHeaderElement);
		document.querySelector("#ww_import_button").addEventListener("click", event => {
			importTicketsFromCsvFile(); // wait for user input, perform checks and do import
		});
	}

	let fatalErrorMessages = [];

	async function importTicketsFromCsvFile() {
		fatalErrorMessages = [];
		const selectedFile = await selectImportFile();
		if (!selectedFile) {
			return;
		}
		const tickets = csvToJson(selectedFile.textContent);
		if (!tickets || !tickets.length) {
			const dialogParams = {
				mainMessage: "Der Ticketimport wird nicht ausgeführt.",
				messageList: ["Die gewählte CSV-Datei ist fehlerhaft."].concat(fatalErrorMessages),
			};
			await showErrorDialog(dialogParams);
			return;
		}
		const dialogParams = {
			mainMessage: `Format und Aufbau von "${selectedFile.name}" wurde erfolgreich geprüft.<br /> Soll der Import jetzt durchgeführt werden?`,
		};
		const startImport = await showConfirmDialog(dialogParams);
		if (!startImport) {
			return;
		}
		showImportStarted();
		const importResult = await importTickets(tickets);
		showImportStopped();
		const resultCsvFileName = selectedFile.name.replace(".csv", "_ergebnis.csv");
		await showCompletionMessage(resultCsvFileName, importResult.ticketIds, importResult.numErrors != 0);
		downloadAndShowTickets(resultCsvFileName, importResult.ticketIds, importResult.messages);
	}

	async function showCompletionMessage(ticketIdCsvFileName, ticketIds, errorOccurred) {
		const dialogParams = {
			mainMessage: errorOccurred
				? `FEHLER: Der Ticketimport wurde nicht vollständig abgeschlossen.`
				: `Ticketimport fehlerfrei und vollständig abgeschlossen.`,
			messageList: [
				`Anzahl importierter Tickets: ${ticketIds.length}`,
				`Die Ergebnisse des Imports werden in der Datei '${ticketIdCsvFileName}' in 'Downloads' gespeichert.`,
				`Erfolgreich angelegte Tickets werden in einem neuen Tab in JIRA angezeigt.`,
			],
			hasCancelButton: false,
			isErrorDialog: errorOccurred,
		};
		await showDialog(dialogParams);
	}

	function downloadAndShowTickets(fileName, ids, messages) {
		const content = messages.join("\n");
		console.log(content);
		const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(content);
		var downloadLink = document.createElement("a");
		downloadLink.href = uri;
		downloadLink.download = fileName;
		document.body.appendChild(downloadLink);
		downloadLink.click();
		document.body.removeChild(downloadLink);
		if (ids.length) {
			window.open(jiraSearchIssuesBaseUrl + "?jql=" + encodeURIComponent("key in (" + ids.join(",") + ")"));
		}
	}

	function showErrorDialog({ mainMessage, messageList = [] }) {
		return showDialog({ mainMessage, messageList, hasCancelButton: false, isErrorDialog: true });
	}

	function showConfirmDialog({ mainMessage, messageList = [] }) {
		return showDialog({ mainMessage, messageList, hasCancelButton: true, isErrorDialog: false });
	}

	function showDialog({ mainMessage, messageList = [], hasCancelButton = false, isErrorDialog = false }) {
		const mainMessageHTML = /*html*/ `<p class='${isErrorDialog ? "error" : ""}'>${mainMessage}</p>`;
		const messageListHTML = messageList.map(message => /*html*/ `<li>${message}</li>`);
		const allMessagesHTML = `${mainMessageHTML}${messageListHTML.length ? `<ul>${messageListHTML.join("")}</ul>` : ""}`;

		const dialog = document.querySelector("#ww_dialog");
		dialog.querySelector("#ww_message").innerHTML = allMessagesHTML;
		if (hasCancelButton) {
			dialog.classList.add("show-cancel");
		} else {
			dialog.classList.remove("show-cancel");
		}
		dialog.showModal();
		return new Promise((resolve, reject) => {
			dialog.addEventListener(
				"click",
				event => {
					if (event.target.matches("#ww_cancelBtn")) resolve(false);
					if (event.target.matches("#ww_confirmBtn")) resolve(true);
				},
				{ once: true }
			);
		});
	}

	function showImportStarted() {
		document.querySelector("#ww_spinner").style.visibility = "visible";
		document.querySelector("#ww_import_button").disabled = true;
	}

	function showImportStopped() {
		document.querySelector("#ww_spinner").style.visibility = "hidden";
		document.querySelector("#ww_import_button").disabled = false;
	}

	function createTicket(ticket) {
		if (!ticket.data) {
			return { id: null, errorMessage: ticket.errorMsg };
		}
		const request = new Request(jiraIssueUrl, {
			headers: {
				"Content-Type": "application/json;charset=UTF-8",
			},
			method: "POST",
			body: JSON.stringify(ticket.data),
		});
		return fetch(request)
			.then(response => response.json())
			.then(data => ({ id: data.key, errorMessage: data.key ? null : getErrorMessage(data) }))
			.catch(error => ({ id: null, errorMessage: "FEHLER: Die Antwort von JIRA konnte nicht verarbeitet werden." }));
	}

	async function importTickets(tickets) {
		const results = await Promise.allSettled(tickets.map(createTicket));
		const createdTicketIds = [];
		const idsOrErrorMessages = new Array(results.length).fill("-");
		let numErrors = 0;
		results.forEach((result, index) => {
			const data = result.value;
			if (data.id) {
				createdTicketIds.push(data.id);
				idsOrErrorMessages[index] = data.id;
			} else {
				idsOrErrorMessages[index] = data.errorMessage;
				numErrors += 1;
			}
		});
		console.log("Ticket-Ids / Fehler");
		console.log(idsOrErrorMessages);
		return { ticketIds: createdTicketIds, messages: idsOrErrorMessages, numErrors: numErrors };
	}

	async function selectImportFile() {
		const pickerOpts = {
			types: [
				{
					description: "CSV-Dateien",
					accept: {
						"text/csv": [".csv"],
					},
				},
			],
			excludeAcceptAllOption: true,
			multiple: false,
		};
		let fileHandle;
		let file = null;
		try {
			[fileHandle] = await window.showOpenFilePicker(pickerOpts);
			file = await fileHandle.getFile();
		} catch (err) {
			/* do nothing */
		}
		if (!file) {
			return null;
		}
		const content = await file.text();
		return { name: file.name, textContent: content };
	}

	function getErrorMessage(errorObject) {
		let errorFields = Object.keys(errorObject.errors);
		let columnNames = Object.keys(columnNameToSchema);
		let errorColumns = [];
		columnNames.forEach(colName => {
			errorFields.forEach(fieldName => {
				if (columnNameToSchema[colName].path.includes(fieldName)) {
					errorColumns.push(colName);
				}
			});
		});
		let errorMessage = "";
		if (errorFields.includes("summary") && errorColumns.length > 1) {
			errorMessage = "FEHLER: Keine Berechtigung für die Ticketanlage vorhanden.";
		} else {
			errorMessage =
				"FEHLER: Der Wert in der Spalte '" +
				errorColumns.join("', '") +
				"' ist fehlerhaft oder im JIRA-Projekt nicht konfiguriert.";
		}
		return errorMessage;
	}

	function parseCsv(str) {
		const arr = [];
		const fieldDelimiter = ";";
		let quote = false;
		for (let row = 0, col = 0, c = 0; c < str.length; c++) {
			let cc = str[c],
				nc = str[c + 1];
			arr[row] = arr[row] || [];
			arr[row][col] = arr[row][col] || "";
			if (cc == '"' && quote && nc == '"') {
				arr[row][col] += cc;
				++c;
				continue;
			}
			if (cc == '"') {
				quote = !quote;
				continue;
			}
			if (cc == fieldDelimiter && !quote) {
				++col;
				continue;
			}
			if (cc == "\r" && nc == "\n" && !quote) {
				++row;
				col = 0;
				++c;
				continue;
			}
			if (cc == "\n" && !quote) {
				++row;
				col = 0;
				continue;
			}
			if (cc == "\r" && !quote) {
				++row;
				col = 0;
				continue;
			}
			arr[row][col] += cc;
		}
		console.log("CSV");
		console.log(arr);
		return arr;
	}

	function getSchemaData(headerRow) {
		const schemaData = [];
		const unknownColumns = [];
		const columnOccurenceError = [];
		for (let col = 0; col < headerRow.length; col++) {
			if (!headerRow[col].startsWith("jira.")) {
				continue;
			} /* igonre all columns that don't start with 'jira.' */
			const fieldSchema = columnNameToSchema[headerRow[col]];
			if (!fieldSchema) {
				unknownColumns.push(headerRow[col]);
				continue;
			} /* unknown field */
			const pathId = fieldSchema.path; /* e.g. "project.key" */
			const path = pathId.split("."); /* e.g. [project, key] */
			var pathExists = false;
			for (let i = 0; i < schemaData.length; i++) {
				if (schemaData[i].id == pathId) {
					schemaData[i].cols.push(col);
					pathExists = true;
				}
			}
			if (!pathExists) {
				schemaData.push({
					id: pathId,
					path: path,
					cols: [col],
					type: fieldSchema.type,
					name: headerRow[col],
					required: fieldSchema.minOccurences == 1,
				});
			}
			pathExists = false;
		}
		console.log("Schema");
		console.log(schemaData);

		schemaData.forEach(entry => {
			let minOcc = columnNameToSchema[entry.name].minOccurences;
			let maxOcc = columnNameToSchema[entry.name].maxOccurences;
			let occ = entry.cols.length;
			if (occ < minOcc || occ > maxOcc) {
				columnOccurenceError.push(entry.name);
			}
		});
		if (unknownColumns.length) {
			fatalErrorMessages.push(
				`Die Spaltennamen "${[...new Set(unknownColumns)].join(
					'", "'
				)}" sind unbekannt, die CSV-Datei kann nicht importiert werden.`
			);
		}
		if (columnOccurenceError.length) {
			fatalErrorMessages.push(
				`Die Spalte(n) "${[...new Set(columnOccurenceError)].join(
					'", "'
				)}" sind entweder nicht vorhanden oder treten zu häufig in der CSV-Datei auf.`
			);
		}
		if (!schemaData || !schemaData.length) {
			fatalErrorMessages.push("Keine Importdaten in gewählter CSV-Datei vorhanden.");
			return null;
		}
		if (unknownColumns.length || columnOccurenceError.length) {
			console.log("Fataler Fehler");
			console.log(fatalErrorMessages);
			return null;
		}

		return schemaData;
	}

	function getTypedValue(valueAsString, type) {
		if (valueAsString == "") {
			return null;
		}
		switch (type) {
			case "number":
				return Number(valueAsString);
				break;
			case "date":
				const dateParts = valueAsString.split(".");
				return dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0];
				break;
			case "string":
				return valueAsString;
				break;
		}
	}

	function csvToJson(csvText) {
		const csvArray = parseCsv(csvText);
		if (!csvArray || csvArray.length < 2) {
			return null;
		}

		const headerRow = csvArray.shift(); /* remove header */
		const schemaData = getSchemaData(headerRow);
		if (!schemaData) {
			return null;
		}

		const tickets = [];
		for (let row = 0; row < csvArray.length; row++) {
			const data = { fields: {} };
			const missingRequiredFields = [];
			let numNonNullFields = 0;
			schemaData.forEach(entry => {
				var keys = entry.path.slice(0); /* clone array */
				var parentEntry = data["fields"];
				let isNullValue = true;
				let isRequiredField = entry.required;
				entry.cols.forEach(col => {
					if (csvArray[row][col] != "") {
						isNullValue = false;
					}
				});
				if (isNullValue && isRequiredField) {
					missingRequiredFields.push(entry.name);
				}
				while (keys.length && !isNullValue) {
					/* only add entry to JSON document if value is not null */
					const currKey = keys.shift(); /* remove first key */
					const nextKey = keys[0];
					if (currKey != "[]" && nextKey) {
						/* insert current key */
						const child = nextKey == "[]" ? [] : {};
						parentEntry[currKey] = child;
						parentEntry = child;
					}
					if (currKey != "[]" && !nextKey) {
						/* insert single value */
						const col = entry.cols[0];
						const value = getTypedValue(csvArray[row][col], entry.type);
						parentEntry[currKey] = value;
					}
					if (currKey == "[]" && nextKey) {
						/* insert objects in array */
						entry.cols.forEach(col => {
							const child = {};
							const value = getTypedValue(csvArray[row][col], entry.type);
							if (value) {
								child[nextKey] = value;
								parentEntry.push(child);
							}
						});
					}
					if (currKey == "[]" && !nextKey) {
						/* insert values in array */
						entry.cols.forEach(col => {
							const value = getTypedValue(csvArray[row][col], entry.type);
							if (value) {
								parentEntry.push(value);
							}
						});
					}
				}
			});
			if (missingRequiredFields.length) {
				tickets[row] = {
					data: null,
					errorMsg: "FEHLER: Für das Pflichtfeld '" + missingRequiredFields.join("', '") + "' ist kein Wert vorhanden.",
				};
			} else {
				tickets[row] = { data: data, errorMsg: null };
			}
		}
		console.log("JSON");
		console.log(tickets);

		return tickets;
	}
	function injectStylesAndDialogHTML() {
		var linkElement = document.createElement("link");
		linkElement.type = "text/css";
		linkElement.rel = "stylesheet";
		linkElement.href = styleSheetUrl;
		document.head.appendChild(linkElement);
		return new Promise((resolve, reject) => {
			linkElement.addEventListener("load", () => resolve(injectDialogHTML()));
		});
	}

	function injectDialogHTML() {
		const dialog = /*html*/ `
                <dialog id="ww_dialog">
                    <form>
                        <div id="ww_message"></div>
                        <div id="ww_dialog_buttons">
													<button id="ww_confirmBtn" class="confirm-button ww-dialog-button" value="ok" formmethod="dialog" autofocus>OK</button>
                            <button id="ww_cancelBtn" class="cancel-button ww-dialog-button" value="cancel" formmethod="dialog">Abbrechen</button>
                        </div>
                    </form>
                </dialog>
            `;
		document.body.insertAdjacentHTML("beforeend", dialog);
	}

	function injectImportButtonsHTML(adjacentElement) {
		if (!document.getElementById("ww_import_button")) {
			const spinnerHtml = /*html*/ `<div id="ww_spinner"></div>`;
			const importButtonHtml = /*html*/ `<input id="ww_import_button" type="button" value="Importieren" />`;
			const helpLink = /*html*/ `<a id="ww_help_link" href="${helpUrl}" target="_blank">Hilfe</a>`;
			const container = /*html*/ `<div id="ww_container">${spinnerHtml}${importButtonHtml}${helpLink}</div>`;
			adjacentElement.insertAdjacentHTML("afterend", container);
		}
		showImportStopped();
	}
})();
