window.HELP_IMPROVE_VIDEOJS = false;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTable(lines, start) {
  var tableLines = [];
  var i = start;

  while (i < lines.length && lines[i].trim().indexOf("|") !== -1 && lines[i].trim() !== "") {
    tableLines.push(lines[i].trim());
    i += 1;
  }

  if (tableLines.length < 2 || !isTableSeparator(tableLines[1])) {
    return null;
  }

  function cells(line) {
    return line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map(function(cell) { return inlineMarkdown(cell.trim()); });
  }

  var header = cells(tableLines[0]);
  var rows = tableLines.slice(2).map(cells);
  var html = '<div class="markdown-table-scroll"><table><thead><tr>';

  header.forEach(function(cell) {
    html += "<th>" + cell + "</th>";
  });
  html += "</tr></thead><tbody>";
  rows.forEach(function(row) {
    html += "<tr>";
    row.forEach(function(cell) {
      html += "<td>" + cell + "</td>";
    });
    html += "</tr>";
  });
  html += "</tbody></table></div>";

  return { html: html, next: i };
}

function renderMarkdown(markdown) {
  var lines = markdown.trim().split(/\r?\n/);
  var html = "";
  var paragraph = [];
  var inComment = false;
  var inMathBlock = false;
  var mathLines = [];

  function flushParagraph() {
    if (paragraph.length) {
      html += "<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>";
      paragraph = [];
    }
  }

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i];
    var trimmed = line.trim();
    var imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    var videoMatch = trimmed.match(/^@video\s+(.+)$/);

    if (inMathBlock) {
      mathLines.push(line);
      if (trimmed === "$$" || trimmed.endsWith("$$")) {
        html += '<div class="math-block">' + escapeHtml(mathLines.join("\n")) + "</div>";
        mathLines = [];
        inMathBlock = false;
      }
      continue;
    }

    if (inComment) {
      if (trimmed.indexOf("-->") !== -1) {
        inComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("<!--")) {
      flushParagraph();
      if (trimmed.indexOf("-->") === -1) {
        inComment = true;
      }
      continue;
    }

    if (trimmed === "$$" || (trimmed.startsWith("$$") && !trimmed.endsWith("$$"))) {
      flushParagraph();
      inMathBlock = true;
      mathLines = [line];
      continue;
    }

    if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
      flushParagraph();
      html += '<div class="math-block">' + escapeHtml(line) + "</div>";
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    var table = parseMarkdownTable(lines, i);
    if (table) {
      flushParagraph();
      html += table.html;
      i = table.next - 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph();
      html += "<h3>" + inlineMarkdown(trimmed.slice(4)) + "</h3>";
      continue;
    }

    if (imageMatch) {
      flushParagraph();
      html += '<img src="' + escapeHtml(imageMatch[2]) + '" alt="' + escapeHtml(imageMatch[1]) + '">';
      if (imageMatch[1]) {
        html += '<p class="figure-caption">' + inlineMarkdown(imageMatch[1]) + "</p>";
      }
      continue;
    }

    if (videoMatch) {
      flushParagraph();
      html += '<video controls muted loop playsinline><source src="' + escapeHtml(videoMatch[1]) + '"></video>';
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return '<div class="markdown-content">' + html + "</div>";
}

function parseMarkdownSections(markdown) {
  var sections = {};
  var current = null;

  markdown.split(/\r?\n/).forEach(function(line) {
    var match = line.match(/^##\s+([a-zA-Z0-9_-]+)\s*$/);
    if (match) {
      current = match[1];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  });

  return sections;
}

function loadMarkdownSlots() {
  var slots = document.querySelectorAll("[data-markdown-section]");
  if (!slots.length) {
    return;
  }

  fetch("./content/project-assets.md")
    .then(function(response) {
      if (!response.ok) {
        throw new Error("No markdown content found.");
      }
      return response.text();
    })
    .then(function(markdown) {
      var sections = parseMarkdownSections(markdown);
      slots.forEach(function(slot) {
        var key = slot.getAttribute("data-markdown-section");
        var content = sections[key] ? sections[key].join("\n").trim() : "";

        if (content) {
          slot.innerHTML = renderMarkdown(content);
          slot.classList.add("is-loaded");
        }
      });

      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise();
      }
    })
    .catch(function() {
      // Empty placeholders are expected before final assets are exported.
    });
}

function configureRolloutVideos() {
  $(".rollout-video").each(function() {
    var rate = parseFloat(this.dataset.playbackRate || "1");
    this.playbackRate = rate;

    this.addEventListener("loadedmetadata", function() {
      this.playbackRate = rate;
    });
  });
}

$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");

    });

    var options = {
			slidesToScroll: 1,
			slidesToShow: 3,
			loop: true,
			infinite: true,
			autoplay: false,
			autoplaySpeed: 3000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
    	// Add listener to  event
    	carousels[i].on('before:show', state => {
    		console.log(state);
    	});
    }

    // Access to bulmaCarousel instance of an element
    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
    	// bulmaCarousel instance is available as element.bulmaCarousel
    	element.bulmaCarousel.on('before-show', function(state) {
    		console.log(state);
    	});
    }

    bulmaSlider.attach();
    loadMarkdownSlots();
    configureRolloutVideos();

})
