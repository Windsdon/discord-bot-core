function loadPage(link) {
    var modalDiv = $("<div/>", {
        class: "modalLoaderDiv"
    });
    $.ajax("/api/" + link, {
        data: {
            type: "render"
        },
        dataType: "json",
        beforeSend: function() {
            $("body").append(modalDiv);
        },
        success: function(data) {

        },
        complete: function() {
            modalDiv.remove();
        },
        error: function() {

        }
    })
}

$(document).ready(function() {
    $(window).bind( "hashchange", function(e) {
        loadPage(location.hash);
    });

    $(window).trigger( "hashchange" );
})
