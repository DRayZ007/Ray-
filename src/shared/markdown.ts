  function escapeHtml(value: string): string {
    return String(value).replace(/[&<>"']/g, function (character) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      } as Record<string, string>)[character];
    });
  }

  function sanitizeUrl(value: string): string {
    var url = String(value || '').trim();
    return /^(https?:|mailto:|#)/i.test(url) ? escapeHtml(url) : '#';
  }

  function decodeEscapedText(value: string): string {
    const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
    return value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => entities[entity]);
  }

  function renderMarkdownInline(text: string): string {
    var placeholders: string[] = [];

    function stash(html: string): string {
      var marker = '\u0000' + placeholders.length + '\u0000';
      placeholders.push(html);
      return marker;
    }

    function restore(value: string): string {
      return value.replace(/\u0000(\d+)\u0000/g, function (match, index) {
        return placeholders[Number(index)] || '';
      });
    }

    var html = escapeHtml(text);

    html = html.replace(/`([^`\n]+)`/g, function (match, code) {
      return stash('<code>' + code + '</code>');
    });

    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+".*?")?\)/g, function (match, label, url) {
      return stash(
        '<a href="' + sanitizeUrl(decodeEscapedText(url)) + '" target="_blank" rel="noopener noreferrer">' +
          renderMarkdownInline(decodeEscapedText(label)) +
          '</a>'
      );
    });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

    return restore(html);
  }

  function isMarkdownBlockStart(line: string): boolean {
    return (
      /^```/.test(line) ||
      /^#{1,6}\s+/.test(line) ||
      /^(-{3,}|\*{3,}|_{3,})$/.test(line) ||
      /^>/.test(line) ||
      /^([-*+])\s+/.test(line) ||
      /^\d+\.\s+/.test(line)
    );
  }

  export function parseMarkdown(markdown: string): string {
    var source = typeof markdown === 'string' ? markdown.replace(/\r\n?/g, '\n') : '';
    var lines = source.split('\n');
    var output: string[] = [];
    var index = 0;

    function push(tag: string, content: string): void {
      output.push('<' + tag + '>' + content + '</' + tag + '>');
    }

    while (index < lines.length) {
      var line = lines[index];
      var trimmed = line.trim();

      if (!trimmed) {
        index += 1;
        continue;
      }

      var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);

      if (heading) {
        var level = heading[1].length;
        push('h' + level, renderMarkdownInline(heading[2]));
        index += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        var codeLines: string[] = [];
        index += 1;

        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          codeLines.push(lines[index]);
          index += 1;
        }

        if (index < lines.length) {
          index += 1;
        }

        output.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        output.push('<hr>');
        index += 1;
        continue;
      }

      if (/^>/.test(trimmed)) {
        var quoteLines: string[] = [];

        while (index < lines.length && /^>/.test(lines[index].trim())) {
          quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
          index += 1;
        }

        push('blockquote', renderMarkdownInline(quoteLines.join(' ')));
        continue;
      }

      var unordered = trimmed.match(/^([-*+])\s+(.+)$/);
      var ordered = trimmed.match(/^\d+\.\s+(.+)$/);

      if (unordered || ordered) {
        var items: string[] = [];
        var listTag = unordered ? 'ul' : 'ol';

        while (index < lines.length) {
          var listLine = lines[index].trim();
          var listMatch = unordered
            ? listLine.match(/^([-*+])\s+(.+)$/)
            : listLine.match(/^\d+\.\s+(.+)$/);

          if (!listMatch) {
            break;
          }

          items.push('<li>' + renderMarkdownInline(listMatch[unordered ? 2 : 1]) + '</li>');
          index += 1;
        }

        push(listTag, items.join(''));
        continue;
      }

      var paragraphLines: string[] = [];

      while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index].trim())) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }

      push('p', renderMarkdownInline(paragraphLines.join(' ')));
    }

    return output.join('\n');
  }
