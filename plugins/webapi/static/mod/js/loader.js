function makeAlert(html, level) {
    var level = level || "danger";
    var elem = $("<div/>", {
        class: "alert alert-" + level + " alert-dismissable"
    });
    elem.html(html);
    elem.prepend($("<button>", {
        type:"button",
        class:"close",
        "data-dismiss": "alert"
    }).text("×"));

    return elem;
}

function loadPage(link, elem) {
    var remove = null;
    var pageWrapper = $("#page-wrapper")
    $.ajax("/api/" + link.substring(1), {
        data: {
            type: "render"
        },
        dataType: "json",
        beforeSend: function() {
            if(elem && !elem.find("i.loadIcon").length) {
                remove = $("<i/>", {
                    class: "fa fa-spinner fa-spin loadIcon",
                    style: "margin-left: 5px"
                });
                elem.append(remove);
            }
            pageWrapper.fadeTo('fast', 0.5);
        },
        success: function(data) {
            if(data && !data.error) {
                if(data.render) {
                    $("#page-header").html(data.render.title);
                    $("#page-content").html(data.render.content);
                }
            } else {
                if(data.error) {
                    $("#page-content").prepend(makeAlert(data.error.message));
                }
            }
        },
        complete: function() {
            if(remove) {
                remove.remove();
            }
            pageWrapper.fadeTo('fast', 1);
        },
        error: function() {
            makeAlert();
        }
    })
}

$(document).ready(function() {
    $(window).bind( "hashchange", function(e) {
        loadPage(location.hash, $("a[href=\"" + location.hash + "\"]"));
    });

    if(!location.hash) {
        location.hash = "#dashboard"
        loadPage(location.hash);
    } else {
        $(window).trigger( "hashchange" );
    }

    $("a").each(function() {
        var elem = $(this);
        var val = elem.attr("href");
        if(val && val[0] == "#" && val.length > 1) {
            elem.click(function() {
                if(location.hash == elem.attr("href")) {
                    loadPage(location.hash, elem);
                } else {
                    location.hash = elem.attr("href");
                }
                return false;
            });
        }
    })
})
