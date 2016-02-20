setInterval(function() {
    console.log("execute");
    $.ajax("/api/logincheck", {
        dataType: "json",
        success: function(data) {
            if(data.user) {
                location = "/";
            }
        }
    })
}, 5000);
