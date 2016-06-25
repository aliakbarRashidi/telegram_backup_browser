// Generated by CoffeeScript 1.10.0
window.angular.module('myApp.controllers', []).controller('MainController', function($scope, $location, MtpApiManager, CryptoWorker, $timeout, Storage) {
  var main;
  window.mainController = this;
  main = this;
  this.loading = false;
  this.step = 1;
  this.log = "";
  this.status = "";
  this.db = null;
  this.user = null;
  this.storage = Storage;
  this.telegram_options = {};
  this.set_status = (function(_this) {
    return function(status) {
      return _this.log = ((new Date()).toString()) + " --- " + status + "\n" + _this.log;
    };
  })(this);
  this.init = (function(_this) {
    return function() {
      _this.set_status("Finding nearest DC...");
      return MtpApiManager.invokeApi('help.getNearestDc', {}, _this.telegram_options).then(function(result) {
        var dc;
        dc = result.nearest_dc;
        _this.set_status("Nearest DC: " + dc);
        if (localStorage.getItem('dc') === null) {
          return localStorage.setItem('dc', dc);
        } else {
          return _this.set_status("Ignoring, because DC " + (localStorage.getItem('dc')) + " is set.");
        }
      })["catch"](function(error) {
        error.handled = true;
        _this.set_status("Couldn't get nearest DC, but that isn't that bad.");
        if (localStorage.getItem('dc') === null) {
          _this.set_status("Using " + Config.App.default_dc + " by default.");
          return localStorage.setItem('dc', Config.App.default_dc);
        } else {
          return _this.set_status("Using pre-set DC " + (localStorage.getItem('dc')));
        }
      })["finally"](function() {
        _this.telegram_options = {
          dcID: localStorage.getItem('dc'),
          createNetworker: true
        };
        _this.set_status("Checking login state");
        return MtpApiManager.invokeApi('account.updateProfile', {}, _this.telegram_options).then(function(result) {
          return _this.save_auth(result);
        })["catch"](function(error) {
          _this.set_status("You are not logged in.");
          _this.user = null;
          return error.handled = true;
        });
      })["catch"](_this.handle_errors);
    };
  })(this);
  this.clear_status = (function(_this) {
    return function() {};
  })(this);
  this.save_auth = (function(_this) {
    return function(user) {
      _this.set_status("You are logged in as " + user.first_name + " " + user.last_name + " " + (user.username ? "(@" + user.username + ")" : void 0));
      _this.user = user;
      _this.open_database(user);
      return MtpApiManager.setUserAuth(_this.telegram_options.dcID, {
        id: user.id
      });
    };
  })(this);
  this.step_1_done = (function(_this) {
    return function() {
      _this.loading = true;
      return MtpApiManager.invokeApi('auth.sendCode', {
        flags: 0,
        phone_number: _this.phone,
        api_id: Config.App.id,
        api_hash: Config.App.hash,
        lang_code: 'en'
      }, _this.telegram_options).then(function(result) {
        _this.phone_code_hash = result.phone_code_hash;
        _this.loading = false;
        return _this.step = 2;
      })["catch"](function(error) {
        if (error.code === 400 && error.type === 'PHONE_PASSWORD_PROTECTED') {
          _this.loading = false;
          _this.step = 3;
          return error.handled = true;
        }
      });
    };
  })(this);
  this.step_2_done = (function(_this) {
    return function() {
      _this.loading = true;
      return MtpApiManager.invokeApi('auth.signIn', {
        phone_number: _this.phone,
        phone_code_hash: _this.phone_code_hash,
        phone_code: _this.phone_code
      }, _this.telegram_options).then(function(result) {
        return _this.save_auth(result.user);
      })["catch"](function(error) {
        if (error.code === 401 && error.type === 'SESSION_PASSWORD_NEEDED') {
          _this.loading = false;
          _this.step = 3;
          return error.handled = true;
        }
      });
    };
  })(this);
  this.step_3_done = (function(_this) {
    return function() {
      var salt;
      _this.loading = true;
      salt = null;
      return MtpApiManager.invokeApi('account.getPassword', {}, _this.telegram_options).then(function(result) {
        return makePasswordHash(result.current_salt, _this.password, CryptoWorker).then(function(hash) {
          return MtpApiManager.invokeApi('auth.checkPassword', {
            password_hash: hash
          }, _this.telegram_options).then(function(result) {
            return _this.save_auth(result.user);
          })["catch"](_this.handle_errors)["finally"](function() {
            return _this.password = null;
          });
        })["catch"](_this.handle_errors);
      });
    };
  })(this);
  this.start_download = (function(_this) {
    return function() {
      _this.loading = true;
      _this.set_status("Fetching dialogs");
      return MtpApiManager.invokeApi('messages.getDialogs', {
        offset_date: 0,
        offset_id: 0,
        offset_peer: {
          _: 'inputPeerEmpty'
        },
        limit: 100,
        max_id: -1
      }, _this.telegram_options).then(_this.process_dialog_list)["catch"](_this.handle_errors);
    };
  })(this);
  this.process_dialog_list = (function(_this) {
    return function(dialogs) {
      var max_id, max_ids, max_known_id;
      _this.set_status("Parsing dialog list");
      _this.set_status("Got " + dialogs.dialogs.length + " Chats");
      max_ids = dialogs.dialogs.map(function(x) {
        return x.top_message;
      });
      max_id = Math.max.apply(Math, max_ids);
      _this.set_status("Newest message id at telegram is " + max_id);
      max_known_id = 0;
      return _this.db.messages.orderBy(":id").last().then(function(last_msg) {
        return max_known_id = last_msg.id;
      })["catch"](function() {})["finally"](function() {
        _this.set_status("Newest messages id in cache is " + max_known_id);
        if (max_known_id >= max_id) {
          _this.set_status("No new messages. Doing nothing.");
          return _this.loading = false;
        } else {
          _this.message_ids_to_load = Array.from(new Array(max_id + 1).keys()).slice(max_known_id + 1);
          _this.message_count = max_id;
          _this.progress_name = "Messages loaded";
          _this.progress_max = _this.message_ids_to_load.length;
          _this.progress_current = 0;
          return _this.download_messages();
        }
      });
    };
  })(this);
  this.download_messages = (function(_this) {
    return function() {
      var ids;
      ids = _this.message_ids_to_load.splice(0, 200);
      _this.set_status("Downloading " + ids.length + " messages, starting with ID=" + ids[0] + "...");
      return MtpApiManager.invokeApi('messages.getMessages', {
        id: ids
      }, _this.telegram_options).then(function(result) {
        _this.temp_result = result;
        _this.set_status("Saving the data...");
        return _this.db.transaction('rw', _this.db.messages, _this.db.people, _this.db.chats, function() {
          _this.db.messages.bulkPut(result.messages);
          _this.db.people.bulkPut(result.users);
          return _this.db.chats.bulkPut(result.chats);
        }).then(function() {
          _this.progress_current += ids.length;
          if (_this.message_ids_to_load.length > 0) {
            _this.set_status("Short delay...");
            return $timeout(_this.download_messages, 750);
          } else if (_this.auto_download) {
            _this.set_status("Starting auto-download of missing media");
            return _this.download_missing_media();
          } else {
            _this.set_status("Done");
            return _this.progress_name = "";
          }
        });
      })["catch"](_this.handle_errors);
    };
  })(this);
  this.download_missing_media = (function(_this) {
    return function() {
      _this.set_status("Fetching all messages with media from cache...");
      return _this.db.messages.filter(function(x) {
        return x.media != null;
      }).toArray().then(function(array) {
        var files, new_array;
        _this.set_status("Found " + array.length + " messages with media.");
        _this.set_status("Filtering by media type...");
        new_array = array.filter(function(elm) {
          if (elm.media._ === "messageMediaPhoto" || elm.media._ === "messageMediaDocument") {
            return true;
          }
          if (elm.media._ === "messageMediaWebPage" || elm.media._ === "messageMediaGeo" || elm.media._ === "messageMediaContact" || elm.media._ === "messageMediaVenue") {
            return false;
          }
          _this.set_status("Unsupported media type: " + elm.media._);
          return false;
        });
        _this.set_status("Remaining messages with stuff to download: " + new_array.length);
        _this.set_status("Checking the cache for already downloaded files...");
        files = [];
        return _this.db.files.toCollection().primaryKeys().then(function(file_ids) {
          return files = file_ids;
        })["catch"](function() {})["finally"](function() {
          _this.media_to_download = new_array.filter(function(elm) {
            return files.indexOf(elm.id) === -1;
          });
          _this.set_status("Remaining messages with not-yet-downloaded stuff: " + _this.media_to_download.length);
          _this.progress_name = "Media to download";
          _this.progress_max = _this.media_to_download.length;
          _this.progress_current = 0;
          return _this.download_first_media();
        });
      });
    };
  })(this);
  this.download_first_media = (function(_this) {
    return function() {
      var biggest, message;
      if (_this.media_to_download.length === 0) {
        _this.set_status("Done.");
        _this.progress_name = "";
        return;
      }
      message = _this.media_to_download.shift();
      if (message.media.photo != null) {
        biggest = null;
        message.media.photo.sizes.forEach(function(size) {
          if (size.size <= 1024 * 1024 && (biggest === null || (size.h >= biggest.h && size.w >= biggest.w))) {
            return biggest = size;
          }
        });
        if (biggest === null) {
          _this.set_status("Couldn't find image size for id " + message.id);
          _this.download_next_media();
        }
        return _this.download_file_with_location(message.id, biggest.location, "image/jpg", "jpg");
      } else if (message.media.document != null) {
        if (message.media.document.size >= 1024 * 1024) {
          _this.set_status("Document of message " + message.id + " is more than 1 MByte. Skipping.");
          _this.download_next_media();
          return;
        }
        return _this.download_file_without_location(message.id, message.media.document);
      } else {
        _this.set_status("Unhandled media type: " + message.media._);
        return _this.download_next_media();
      }
    };
  })(this);
  this.download_file_without_location = (function(_this) {
    return function(id, data_obj) {
      var ext, file, loc;
      file = data_obj.file_name;
      ext = "";
      if (file == null) {
        ext = "." + data_obj.mime_type.split('/')[1];
        if (ext === ".octet-stream") {
          ext = "";
        }
        file = "t_" + (data_obj.type || 'file') + data_obj.id + ext;
      }
      loc = {
        _: "inputDocumentFileLocation",
        id: data_obj.id,
        access_hash: data_obj.access_hash,
        file_name: file,
        dc_id: data_obj.dc_id,
        size: data_obj.size
      };
      return _this.download_file_with_location(id, loc, data_obj.mime_type, ext.substr(1));
    };
  })(this);
  this.download_file_with_location = (function(_this) {
    return function(id, location, mimetype, ext) {
      if (location._ === null || location._ === "fileLocation") {
        location._ = "inputFileLocation";
      }
      return MtpApiManager.invokeApi('upload.getFile', {
        location: location,
        offset: 0,
        limit: 1024 * 1024
      }, {
        dcID: location.dc_id,
        fileDownload: true,
        createNetworker: true,
        noErrorBox: true
      }).then(function(result) {
        return _this.db.files.put({
          id: id,
          filetype: ext,
          mimetype: mimetype,
          data: btoa(_this.ab2str(result.bytes))
        })["finally"](_this.download_next_media);
      })["catch"](_this.handle_errors);
    };
  })(this);
  this.download_next_media = (function(_this) {
    return function() {
      _this.progress_current++;
      return _this.download_first_media();
    };
  })(this);
  this.download_json = (function(_this) {
    return function() {
      var zip;
      _this.set_status("Creating ZIP file. This may take a few seconds.");
      _this.set_status("Creating and adding JSON data file...");
      zip = new Zlib.Zip();
      return _this.db.messages.toArray().then(function(result) {
        zip.addFile(_this.str2ab(JSON.stringify(result)), {
          filename: _this.str2ab("data.json")
        });
        _this.set_status("Adding all available media files...");
        return _this.db.files.toArray().then(function(files) {
          var data;
          _this.progress_name = "Media files to add";
          _this.progress_max = files.length;
          _this.progress_current = 0;
          $scope.$apply();
          files.forEach(function(file) {
            var filename;
            filename = "" + file.id;
            if ((file.filetype != null) && file.filetype !== "") {
              filename = filename + "." + file.filetype;
            }
            zip.addFile(_this.str2ab(atob(file.data)), {
              filename: _this.str2ab(filename)
            });
            _this.progress_current++;
            return $scope.$apply();
          });
          data = zip.compress();
          data = URL.createObjectURL(new File([data], "telegram_backup.zip", {
            type: 'application/zip'
          }));
          location.href = data;
          _this.set_status("Done");
          return _this.progress_name = "";
        });
      })["catch"](_this.handle_errors);
    };
  })(this);
  this.handle_errors = (function(_this) {
    return function(error) {
      _this.set_status("An error occured: " + JSON.stringify(error));
      console.log(error);
      return error.handled = true;
    };
  })(this);
  this.open_database = (function(_this) {
    return function(user) {
      _this.db = new Dexie("telegram_backup_" + user.id);
      _this.db.version(1).stores({
        messages: 'id,date',
        chats: 'id',
        people: 'id',
        files: 'id'
      });
      return _this.db.open()["catch"](_this.handle_errors);
    };
  })(this);
  this.test = (function(_this) {
    return function() {
      return $.getScript('test.js', function() {
        return doTest(_this);
      });
    };
  })(this);
  this.str2ab = function(str) {
    var array, i, j, ref;
    array = new (window.Uint8Array != null ? Uint8Array : Array)(str.length);
    for (i = j = 0, ref = str.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      array[i] = str.charCodeAt(i) & 0xff;
    }
    return array;
  };
  this.ab2str = function(array) {
    var i, j, ref, target;
    target = new Array(array.length);
    for (i = j = 0, ref = array.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      target[i] = String.fromCharCode(array[i]);
    }
    return target.join("");
  };
  this.logout = (function(_this) {
    return function() {
      _this.user = null;
      MtpApiManager.logOut();
      localStorage.removeItem("dc_auth_key");
      localStorage.removeItem("dc1_auth_key");
      localStorage.removeItem("dc2_auth_key");
      localStorage.removeItem("dc3_auth_key");
      localStorage.removeItem("dc4_auth_key");
      localStorage.removeItem("dc5_auth_key");
      localStorage.removeItem("dc_server_salt");
      localStorage.removeItem("dc1_server_salt");
      localStorage.removeItem("dc2_server_salt");
      localStorage.removeItem("dc3_server_salt");
      localStorage.removeItem("dc4_server_salt");
      localStorage.removeItem("dc5_server_salt");
      localStorage.removeItem("user_auth");
      localStorage.setItem("dc", 2);
      return location.href = "index.html";
    };
  })(this);
  this.init();
  return null;
});


myApp = angular.module('myApp', [
	'izhukov.utils',
	'izhukov.mtproto',
	'izhukov.mtproto.wrapper',
	'myApp.controllers',
	'myApp.i18n'])
.run(function(MtpApiManager) {})
.factory('$modalStack', function() {
	$modalStack = {};
	$modalStack.dismissAll = function() {};
	return $modalStack;
}).service('ErrorService', function() {}
).service('TelegramMeWebService', function() {
	this.setAuthorized = function(val) {
		console.log("TelegramMeWebService.setAuthorized(#{val})")
	}
});
;

//# sourceMappingURL=app.js.map
