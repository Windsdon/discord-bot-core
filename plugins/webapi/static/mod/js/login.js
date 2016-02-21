var interval = setInterval(function() {
    $.ajax("/api/logincheck", {
        dataType: "json",
        success: function(data) {
            if(data.user) {
                $("#loginCommand").hide();
                $("#userAvatar").attr("src", data.user.avatarURL);
                $("#username").text(data.user.username);
                $("#loginSuccess").show();
                clearInterval(interval);
            }
        }
    })
}, 5000);
