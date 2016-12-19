# -*- mode: ruby -*-
# vi: set ft=ruby :

$script = <<SCRIPT

echo Disabling selinux...
setenforce 0 | /bin/true # turn off selinux
#perl -pi -e 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config

echo Disabling firewall...
chkconfig iptables off
service iptables stop

echo Installing EPEL repository...
rpm -i http://download.fedoraproject.org/pub/epel/6/i386/epel-release-6-8.noarch.rpm

echo Installing MongoDB...
yum -y install mongodb-server
yum -y install mongodb

echo Starting MongoDB...
chkconfig mongod on
service mongod start

echo Installing NodeJS...
yum -y install nodejs
yum -y install npm
npm install -g grunt-cli

echo Installing LaTeX...
yum -y install texlive-latex
yum -y install ImageMagick

echo Installing Apache...
yum -y install httpd

echo Point Apache to the frontend files...
rmdir /var/www/html
ln -s /vagrant/frontend /var/www/html

echo Starting Apache...
chkconfig httpd on
service httpd start

SCRIPT

Vagrant.configure("2") do |config|
  config.vm.box = "centos64"
  config.vm.box_url = "http://puppet-vagrant-boxes.puppetlabs.com/centos-64-x64-vbox4210.box"
  config.vm.network :forwarded_port, guest: 3000, host: 3000
  config.vm.network :forwarded_port, guest: 80, host: 8080
  config.vm.provision :shell, :inline => $script
end
