"""Keep the formatting of imported article bodies while removing active content."""

from urllib.parse import urljoin, urlsplit

import nh3


TAGS = {
    "a", "abbr", "audio", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
    "dd", "del", "details", "div", "dl", "dt", "em", "figcaption", "figure", "h1", "h2",
    "h3", "h4", "h5", "h6", "hr", "i", "img", "kbd", "li", "mark", "ol", "p", "pre",
    "s", "small", "source", "span", "strong", "sub", "summary", "sup", "table", "tbody",
    "td", "tfoot", "th", "thead", "tr", "u", "ul", "video",
}
ATTRIBUTES = {
    "*": {"id", "style", "title"},
    "a": {"href"},
    "blockquote": {"cite"},
    "col": {"span"},
    "img": {"src", "alt", "width", "height"},
    "li": {"value"},
    "ol": {"start", "reversed", "type"},
    "source": {"src", "type"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
    "audio": {"src"},
    "video": {"src", "poster"},
}
CLASSES = {
    "figure": {"imageblock", "alignLeft", "alignCenter", "alignRight", "floatLeft", "floatRight", "widthContent"},
    "div": {"moreless-content", "og-text"},
    "p": {"og-title", "og-desc", "og-host"},
    "a": {"btn-toggle-moreless"},
}
STYLES = {
    "background-color", "border-collapse", "color", "font-family", "font-size",
    "font-style", "font-weight", "height", "list-style-type", "text-align",
    "text-decoration", "vertical-align", "width",
}


def clean_article(markup, original_url, images=None):
    def filter_attribute(tag, name, value):
        if tag == "a" and name == "href" and value.startswith("#"):
            return value
        if name not in {"href", "src", "cite", "poster"}:
            return value
        try:
            absolute = urljoin(original_url, value.strip())
            link = urlsplit(absolute)
            if not link.hostname or link.username or link.password:
                return None
            if tag == "img" and name == "src":
                if link.scheme != "https":
                    return None
                return (images or {}).get(absolute, absolute)
            return absolute
        except ValueError:
            return None

    return nh3.clean(
        markup,
        tags=TAGS,
        clean_content_tags={"script", "style", "iframe", "object", "svg", "math", "template"},
        attributes=ATTRIBUTES,
        allowed_classes=CLASSES,
        filter_style_properties=STYLES,
        attribute_filter=filter_attribute,
        set_tag_attribute_values={"img": {"loading": "lazy"}, "video": {"controls": ""}, "audio": {"controls": ""}},
        url_schemes={"http", "https"},
    )
