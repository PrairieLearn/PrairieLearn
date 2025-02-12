#define CATCH_CONFIG_MAIN
#include "catch_amalgamated.hpp"
#include <vector>
#include <string>
#include "../solution.hpp"

using namespace std;

TEST_CASE("Email validation basic tests", "[email][3]") {
    vector<string> emails = {"test@example.com", "invalid", "multiple@@at.com", "no@domain", "@nodomain.com"};
    vector<string> valid, invalid;
    
    validateEmails(emails, valid, invalid);
    
    REQUIRE(valid.size() == 1);
    REQUIRE(invalid.size() == 4);
    CHECK(valid[0] == "test@example.com");
}

TEST_CASE("Empty input handling", "[email][2]") {
    vector<string> emails;
    vector<string> valid, invalid;
    
    validateEmails(emails, valid, invalid);
    
    REQUIRE(valid.empty());
    REQUIRE(invalid.empty());
}
