var interval = setInterval(function() {
    $.ajax("/api/logincheck", {
        dataType: "json",
        success: function(data) {
            if(data.response && data.response.user) {
                $("#loginCommand").hide();
                $("#userAvatar").attr("src", data.response.user.avatarURL);
                $("#username").text(data.response.user.username);
                $("#loginSuccess").show();
                clearInterval(interval);
            }
        }
    })
}, 5000);
