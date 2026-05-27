def generate(data):
    user = data["options"].get("user")
    group = data["options"].get("group")

    data["params"]["user_uid"] = user["uid"] if user else None
    data["params"]["user_name"] = user["name"] if user else None
    data["params"]["user_uin"] = user["uin"] if user else None

    if group is not None:
        data["params"]["group_name"] = group["name"]
        data["params"]["group_member_uids"] = ", ".join(
            m["uid"] for m in group["members"]
        )
    else:
        data["params"]["group_name"] = None
        data["params"]["group_member_uids"] = None
